const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Security Rate Limiting for Auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 requests per 15 minutes
  message: { success: false, error: 'Too many authentication attempts. Please try again in 15 minutes.' }
});

app.use('/api/auth/', authLimiter);

// Helper for audit logs
function logAudit(userId, action, ip) {
  db.run(
    `INSERT INTO audit_logs (user_id, action, ip_address) VALUES (?, ?, ?)`,
    [userId, action, ip || '127.0.0.1']
  );
}

// 1. Get user list (for user switcher / list)
app.get('/api/users/list', (req, res) => {
  db.all('SELECT username, created_at FROM users ORDER BY username ASC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, users: rows || [] });
  });
});

// Check if username already exists
app.get('/api/auth/check-username', (req, res) => {
  const { username } = req.query;
  if (!username) return res.json({ exists: false });

  const cleanUsername = username.trim().toLowerCase();

  if (cleanUsername === 'admin') {
    return res.json({ exists: true, message: 'Tài khoản admin là tài khoản hệ thống.' });
  }

  db.get('SELECT id FROM users WHERE username = ?', [cleanUsername], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ exists: !!row });
  });
});

// 2. Register new User Account & initial KDBX vault
app.post('/api/auth/register', (req, res) => {
  const { username, auth_hash, initial_kdbx_base64 } = req.body;

  if (!username || !auth_hash || !initial_kdbx_base64) {
    return res.status(400).json({ success: false, error: 'Tên tài khoản và mật khẩu không được để trống.' });
  }

  const cleanUsername = username.trim().toLowerCase();

  if (cleanUsername === 'admin') {
    return res.status(400).json({ success: false, error: "Tên tài khoản 'admin' là tài khoản quản trị hệ thống!" });
  }

  // Hash the auth_hash with bcrypt before storing
  bcrypt.hash(auth_hash, 10, (err, hash) => {
    if (err) return res.status(500).json({ success: false, error: 'Lỗi mã hóa credentials.' });

    db.run(
      'INSERT INTO users (username, auth_hash) VALUES (?, ?)',
      [cleanUsername, hash],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ success: false, error: `Tên tài khoản '${cleanUsername}' đã tồn tại trên máy chủ!` });
          }
          return res.status(500).json({ success: false, error: err.message });
        }

        const userId = this.lastID;
        const kdbxBuffer = Buffer.from(initial_kdbx_base64, 'base64');
        const filename = `${cleanUsername}.kdbx`;

        db.run(
          'INSERT INTO vaults (user_id, filename, kdbx_data, size_bytes) VALUES (?, ?, ?, ?)',
          [userId, filename, kdbxBuffer, kdbxBuffer.length],
          (err) => {
            if (err) return res.status(500).json({ success: false, error: 'Failed to create initial KDBX vault record.' });

            logAudit(userId, 'REGISTER', req.ip);
            res.json({
              success: true,
              message: `Account '${cleanUsername}' created successfully with native ${filename} vault!`,
              username: cleanUsername
            });
          }
        );
      }
    );
  });
});

// 3. Login & Fetch KDBX Vault
app.post('/api/auth/login', (req, res) => {
  const { username, auth_hash } = req.body;

  if (!username || !auth_hash) {
    return res.status(400).json({ success: false, error: 'Username and password hash required.' });
  }

  const cleanUsername = username.trim().toLowerCase();

  db.get('SELECT * FROM users WHERE username = ?', [cleanUsername], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    bcrypt.compare(auth_hash, user.auth_hash, (err, isMatch) => {
      if (err || !isMatch) {
        logAudit(user.id, 'LOGIN_FAILED', req.ip);
        return res.status(401).json({ success: false, error: 'Invalid username or password.' });
      }

      // Fetch user's KDBX binary BLOB
      db.get('SELECT * FROM vaults WHERE user_id = ?', [user.id], (err, vault) => {
        if (err || !vault) {
          return res.status(404).json({ success: false, error: 'Vault database file not found on server.' });
        }

        logAudit(user.id, 'LOGIN_SUCCESS', req.ip);
        res.json({
          success: true,
          username: user.username,
          filename: vault.filename,
          updated_at: vault.updated_at,
          kdbx_base64: vault.kdbx_data.toString('base64')
        });
      });
    });
  });
});

// 4. Change Account Master Password
app.post('/api/auth/change-password', (req, res) => {
  const { username, current_auth_hash, new_auth_hash, kdbx_base64 } = req.body;

  if (!username || !current_auth_hash || !new_auth_hash || !kdbx_base64) {
    return res.status(400).json({ success: false, error: 'Missing parameters for password change.' });
  }

  const cleanUsername = username.trim().toLowerCase();

  db.get('SELECT * FROM users WHERE username = ?', [cleanUsername], (err, user) => {
    if (err || !user) return res.status(401).json({ success: false, error: 'User not found.' });

    bcrypt.compare(current_auth_hash, user.auth_hash, (err, isMatch) => {
      if (err || !isMatch) {
        return res.status(401).json({ success: false, error: 'Current password incorrect.' });
      }

      bcrypt.hash(new_auth_hash, 10, (err, newBcryptHash) => {
        if (err) return res.status(500).json({ success: false, error: 'Error hashing new password.' });

        db.run('UPDATE users SET auth_hash = ? WHERE id = ?', [newBcryptHash, user.id], (err) => {
          if (err) return res.status(500).json({ success: false, error: 'Failed to update user auth hash.' });

          const kdbxBuffer = Buffer.from(kdbx_base64, 'base64');
          const updatedAt = new Date().toISOString();

          db.run(
            'UPDATE vaults SET kdbx_data = ?, size_bytes = ?, updated_at = ? WHERE user_id = ?',
            [kdbxBuffer, kdbxBuffer.length, updatedAt, user.id],
            (err) => {
              if (err) return res.status(500).json({ success: false, error: 'Failed to update vault file.' });

              logAudit(user.id, 'CHANGE_PASSWORD', req.ip);
              res.json({ success: true, message: 'Master Password changed successfully!' });
            }
          );
        });
      });
    });
  });
});

// 5. Sync / Update KDBX Vault
app.post('/api/vault/sync', (req, res) => {
  const { username, auth_hash, kdbx_base64 } = req.body;

  if (!username || !auth_hash || !kdbx_base64) {
    return res.status(400).json({ success: false, error: 'Missing sync parameters.' });
  }

  const cleanUsername = username.trim().toLowerCase();

  db.get('SELECT * FROM users WHERE username = ?', [cleanUsername], (err, user) => {
    if (err || !user) return res.status(401).json({ success: false, error: 'Unauthorized.' });

    bcrypt.compare(auth_hash, user.auth_hash, (err, isMatch) => {
      if (err || !isMatch) return res.status(401).json({ success: false, error: 'Authentication failed.' });

      const kdbxBuffer = Buffer.from(kdbx_base64, 'base64');
      const updatedAt = new Date().toISOString();

      db.run(
        'UPDATE vaults SET kdbx_data = ?, size_bytes = ?, updated_at = ? WHERE user_id = ?',
        [kdbxBuffer, kdbxBuffer.length, updatedAt, user.id],
        (err) => {
          if (err) return res.status(500).json({ success: false, error: 'Failed to sync vault on server DB.' });

          logAudit(user.id, 'VAULT_SYNC', req.ip);
          res.json({ success: true, message: 'Vault synced successfully to Server DB!', updated_at: updatedAt });
        }
      );
    });
  });
});

// 6. Direct Raw .kdbx File Download
app.get('/api/vault/download/:username', (req, res) => {
  const cleanUsername = req.params.username.trim().toLowerCase();

  db.get('SELECT u.id, v.filename, v.kdbx_data FROM users u JOIN vaults v ON u.id = v.user_id WHERE u.username = ?', [cleanUsername], (err, row) => {
    if (err || !row) {
      return res.status(404).send('Vault file not found.');
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${row.filename}"`);
    res.send(row.kdbx_data);
  });
});

// 7. Admin: Get all accounts detailed metadata (Only for 'admin' user)
app.get('/api/admin/users', (req, res) => {
  const requester = (req.query.requester || '').trim().toLowerCase();
  if (requester !== 'admin') {
    return res.status(403).json({ success: false, error: 'Forbidden: Chỉ tài khoản admin mới có quyền truy cập.' });
  }

  const query = `
    SELECT u.id, u.username, u.created_at, v.filename, v.size_bytes, v.updated_at
    FROM users u
    LEFT JOIN vaults v ON u.id = v.user_id
    ORDER BY u.created_at DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }

    res.json({
      success: true,
      users: rows || [],
      total_count: rows ? rows.length : 0
    });
  });
});

// 8. Admin: Delete user account & vault (Only for 'admin' user)
app.delete('/api/admin/users/:username', (req, res) => {
  const requester = (req.query.requester || '').trim().toLowerCase();
  if (requester !== 'admin') {
    return res.status(403).json({ success: false, error: 'Forbidden: Chỉ tài khoản admin mới có quyền xóa.' });
  }

  const cleanUsername = req.params.username.trim().toLowerCase();
  if (cleanUsername === 'admin') {
    return res.status(400).json({ success: false, error: 'Không thể xóa tài khoản Admin hệ thống.' });
  }

  db.get('SELECT id FROM users WHERE username = ?', [cleanUsername], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // Delete vault & user
    db.run('DELETE FROM vaults WHERE user_id = ?', [user.id], (err) => {
      db.run('DELETE FROM users WHERE id = ?', [user.id], (err) => {
        logAudit(user.id, 'ADMIN_DELETE_USER', req.ip);
        res.json({ success: true, message: `Account '${cleanUsername}' deleted successfully.` });
      });
    });
  });
});

// 9. Admin: Change Password for Admin account
app.post('/api/admin/change-password', (req, res) => {
  const { username, current_auth_hash, new_auth_hash } = req.body;

  if (!username || username.toLowerCase() !== 'admin' || !current_auth_hash || !new_auth_hash) {
    return res.status(400).json({ success: false, error: 'Thông tin không hợp lệ.' });
  }

  db.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ success: false, error: 'Tài khoản admin không tồn tại.' });
    }

    bcrypt.compare(current_auth_hash, user.auth_hash, (err, isMatch) => {
      if (err || !isMatch) {
        return res.status(401).json({ success: false, error: 'Mật khẩu hiện tại của Admin không chính xác!' });
      }

      bcrypt.hash(new_auth_hash, 10, (err, bcryptHash) => {
        if (err) return res.status(500).json({ success: false, error: 'Lỗi mã hóa mật khẩu.' });

        db.run('UPDATE users SET auth_hash = ? WHERE id = ?', [bcryptHash, user.id], (err) => {
          if (err) return res.status(500).json({ success: false, error: err.message });

          logAudit(user.id, 'ADMIN_CHANGE_PASSWORD', req.ip);
          res.json({ success: true, message: 'Đã cập nhật mật khẩu Admin mới thành công!' });
        });
      });
    });
  });
});

// Serve Static Production Frontend Build (When dist exists)
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

// Start Server
app.listen(PORT, () => {
  console.log(`[Cyber Vault Server] Running on http://localhost:${PORT}`);
});
