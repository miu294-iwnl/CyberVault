import { CyberMatrixGrid } from './components/matrixGrid.js';
import {
  deriveAuthHash,
  createNewKdbxVault,
  unlockKdbxVault,
  serializeKdbxVault,
  base64ToArrayBuffer,
  arrayBufferToBase64,
  downloadKdbxFile,
  getAllEntries,
  addEntryToDb,
  updateEntryInDb,
  deleteEntryFromDb,
  changeMasterPasswordInDb
} from './crypto/kdbxVault.js';

// Modular Page HTML Templates
import authHtml from './pages/auth.html?raw';
import headerHtml from './pages/header.html?raw';
import databaseHtml from './pages/database.html?raw';
import adminHtml from './pages/admin.html?raw';
import modalsHtml from './pages/modals.html?raw';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001/api'
  : '/api';
const LOCK_TIMEOUT_SECONDS = 300; // 5 mins standard auto-lock

// State Management
let currentDb = null;
let currentUsername = '';
let currentMasterPassword = '';
let currentAuthHash = '';
let entriesList = [];
let autoLockTimer = null;
let lockSecondsRemaining = LOCK_TIMEOUT_SECONDS;
let activeCategoryFilter = 'ALL';
let currentViewMode = localStorage.getItem('vault_view_mode') || 'grid';
let currentSortMode = localStorage.getItem('vault_sort_mode') || 'alpha-asc';
let customCategories = JSON.parse(localStorage.getItem('vault_custom_categories')) || [
  'Websites', 'Email', 'Banking', 'Server', 'Social', 'Shared'
];

// Mount Modular Page HTML Templates into DOM Shell safely
function renderPageComponents() {
  const authEl = document.getElementById('authOverlay');
  const headerEl = document.getElementById('headerNav');
  const dbEl = document.getElementById('databaseView');
  const adminEl = document.getElementById('adminView');
  const modalsEl = document.getElementById('modalsContainer');

  if (authEl) authEl.innerHTML = authHtml;
  if (headerEl) headerEl.innerHTML = headerHtml;
  if (dbEl) dbEl.innerHTML = databaseHtml;
  if (adminEl) adminEl.innerHTML = adminHtml;
  if (modalsEl) modalsEl.innerHTML = modalsHtml;
}

// Initialize App
function initApp() {
  // 0. Mount Modular Page HTML Templates
  renderPageComponents();

  // 1. Initialize Canvas Background
  new CyberMatrixGrid('matrixCanvas');

  // 2. Fetch User List for Switcher
  fetchUserList();

  // 3. Bind UI Event Listeners
  bindEvents();

  // 4. Initialize Category UI
  renderCategoryUI();

  // 5. Initialize Router
  handleRoute(window.location.pathname);
  window.addEventListener('popstate', () => handleRoute(window.location.pathname));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Client-Side SPA Router
function navigateTo(path, replace = false) {
  if (replace) {
    window.history.replaceState(null, '', path);
  } else if (window.location.pathname !== path) {
    window.history.pushState(null, '', path);
  }
  handleRoute(path);
}

function handleRoute(path = window.location.pathname) {
  const cleanPath = path.toLowerCase();

  if (cleanPath === '/register') {
    showAuthView('register');
  } else if (cleanPath === '/database') {
    if (currentUsername.toLowerCase() === 'admin') {
      // Admin has no password database -> redirect directly to /admin
      navigateTo('/admin', true);
    } else if (currentDb) {
      showDatabaseView();
    } else {
      navigateTo('/login', true);
    }
  } else if (cleanPath === '/admin') {
    if (currentUsername.toLowerCase() === 'admin') {
      showAdminView();
    } else {
      showToast('⛔ Quyền truy cập bị từ chối! Chỉ duy nhất tài khoản "admin" mới có quyền truy cập trang quản trị.', 'danger');
      if (currentDb) {
        navigateTo('/database', true);
      } else {
        navigateTo('/login', true);
      }
    }
  } else {
    // Default to /login for / or any other route
    if (cleanPath !== '/login') {
      navigateTo('/login', true);
    } else {
      showAuthView('login');
    }
  }
}

function showAuthView(tab = 'login') {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('authOverlay').classList.remove('hidden');

  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  if (tab === 'register') {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  } else {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  }
}

function showDatabaseView() {
  document.getElementById('authOverlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('databaseView').classList.remove('hidden');
  document.getElementById('adminView').classList.add('hidden');
}

function showAdminView() {
  if (currentUsername.toLowerCase() !== 'admin') {
    showToast('⛔ Quyền truy cập bị từ chối! Chỉ duy nhất tài khoản "admin" mới có quyền xem trang Admin.', 'danger');
    if (currentDb) {
      navigateTo('/database', true);
    } else {
      navigateTo('/login', true);
    }
    return;
  }
  document.getElementById('authOverlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('databaseView').classList.add('hidden');
  document.getElementById('adminView').classList.remove('hidden');

  // Hide "Back to Database" button since Admin has no password database
  const btnBackToDb = document.getElementById('btnBackToDatabase');
  if (btnBackToDb) btnBackToDb.classList.add('hidden');

  fetchAdminUserList();
}

// Fetch User List from Server (For Login Switcher Chips)
async function fetchUserList() {
  const container = document.getElementById('userChips');
  if (!container) return;
  try {
    const res = await fetch(`${API_BASE}/users/list`);
    const data = await res.json();

    if (data.success && data.users.length > 0) {
      container.innerHTML = data.users.map(u => 
        `<span class="user-chip" data-user="${u.username}">👤 ${u.username}.kdbx</span>`
      ).join('');

      document.querySelectorAll('.user-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
          const user = e.target.getAttribute('data-user');
          document.getElementById('loginUsername').value = user;
          document.getElementById('loginPassword').focus();
        });
      });
    } else {
      container.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted);">Chưa có tài khoản nào. Hãy tạo tài khoản đầu tiên!</span>';
    }
  } catch (err) {
    container.innerHTML = '<span style="font-size:0.8rem; color:var(--neon-amber);">Tự động kết nối Server DB...</span>';
  }
}

// Fetch Detailed Accounts List for Admin Dashboard (/admin)
async function fetchAdminUserList() {
  const tbody = document.getElementById('adminUserTableBody');
  const statUsers = document.getElementById('statTotalUsers');
  const statSize = document.getElementById('statTotalSize');

  try {
    const res = await fetch(`${API_BASE}/admin/users?requester=${encodeURIComponent(currentUsername)}`);
    const data = await res.json();

    if (!data.success || !data.users) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--neon-pink)">❌ ${data.error || 'Không thể tải danh sách tài khoản server'}</td></tr>`;
      return;
    }

    statUsers.innerText = data.total_count || 0;

    let totalSizeBytes = 0;
    data.users.forEach(u => totalSizeBytes += (u.size_bytes || 0));
    statSize.innerText = `${(totalSizeBytes / 1024).toFixed(1)} KB`;

    if (data.users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:2rem;">Chưa có tài khoản nào trên máy chủ.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.users.map((u, idx) => {
      const sizeKb = u.size_bytes ? `${(u.size_bytes / 1024).toFixed(1)} KB` : 'N/A';
      const createdDate = u.created_at ? new Date(u.created_at).toLocaleString('vi-VN') : 'N/A';
      const updatedDate = u.updated_at ? new Date(u.updated_at).toLocaleString('vi-VN') : createdDate;
      const isAdminAccount = u.username.toLowerCase() === 'admin';

      return `
        <tr>
          <td style="color:var(--text-muted); font-weight:bold;">#${idx + 1}</td>
          <td>
            <strong style="color:var(--neon-emerald);">${escapeHtml(u.username)}</strong>
            ${isAdminAccount ? '<span style="font-size:0.65rem; background:rgba(0,255,157,0.15); border:1px solid var(--neon-emerald); color:var(--neon-emerald); padding:0.1rem 0.4rem; border-radius:4px; margin-left:0.4rem;">SYSTEM ADMIN</span>' : ''}
          </td>
          <td>
            <span style="color:var(--neon-cyan);">${escapeHtml(u.filename || `${u.username}.kdbx`)}</span>
          </td>
          <td>${sizeKb}</td>
          <td>${createdDate}</td>
          <td>${updatedDate}</td>
          <td style="text-align:right;">
            ${isAdminAccount ? '<span style="font-size:0.75rem; color:var(--text-muted);">Bảo vệ hệ thống</span>' : `<button class="cyber-btn btn-small danger btn-admin-delete" data-username="${escapeHtml(u.username)}" style="width:auto; padding:0.35rem 0.75rem;" title="Xóa tài khoản máy chủ">🗑️ Xóa</button>`}
          </td>
        </tr>
      `;
    }).join('');

    // Bind Delete User event handlers in Admin table
    tbody.querySelectorAll('.btn-admin-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const username = e.currentTarget.getAttribute('data-username');
        if (confirm(`⚠️ CẢNH BÁO ADMIN: Bạn có chắc chắn muốn xóa tài khoản '${username}' cùng tệp .kdbx khỏi máy chủ không? Hành động này không thể hoàn tác!`)) {
          try {
            const delRes = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(username)}?requester=${encodeURIComponent(currentUsername)}`, {
              method: 'DELETE'
            });
            const delData = await delRes.json();
            if (delData.success) {
              showToast(`🗑️ Đã xóa tài khoản '${username}' thành công!`, 'info');
              fetchAdminUserList();
              fetchUserList();
            } else {
              showToast(`❌ Lỗi xóa tài khoản: ${delData.error}`, 'danger');
            }
          } catch (err) {
            showToast(`❌ Lỗi kết nối server: ${err.message}`, 'danger');
          }
        }
      });
    });

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--neon-pink); padding:2rem;">❌ Lỗi kết nối Server: ${err.message}</td></tr>`;
  }
}

// Render Categories UI in Mobile Menu & Desktop Pills
function renderCategoryUI() {
  const mobileContainer = document.getElementById('mobileCategoryList');
  const desktopContainer = document.getElementById('categoryPills');
  const modalSelect = document.getElementById('entryCategory');

  if (mobileContainer) {
    let html = `<button class="dropdown-cat-item ${activeCategoryFilter === 'ALL' ? 'active' : ''}" data-cat="ALL">Tất cả danh mục</button>`;
    customCategories.forEach(cat => {
      html += `<button class="dropdown-cat-item ${activeCategoryFilter === cat ? 'active' : ''}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
    });
    mobileContainer.innerHTML = html;

    mobileContainer.querySelectorAll('.dropdown-cat-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cat = e.currentTarget.getAttribute('data-cat');
        activeCategoryFilter = cat;
        renderCategoryUI();
        document.getElementById('mobileMenuPanel')?.classList.add('hidden');
        document.getElementById('btnMobileMenu')?.classList.remove('active');
        renderPasswordCards();
      });
    });
  }

  if (desktopContainer) {
    let html = `<button class="cat-pill ${activeCategoryFilter === 'ALL' ? 'active' : ''}" data-cat="ALL">Tất cả</button>`;
    customCategories.forEach(cat => {
      html += `<button class="cat-pill ${activeCategoryFilter === cat ? 'active' : ''}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
    });
    html += `<button id="btnAddCategoryDesktop" class="cat-pill" style="color:var(--neon-emerald); font-weight:600;">➕ Mới</button>`;
    desktopContainer.innerHTML = html;

    desktopContainer.querySelectorAll('.cat-pill[data-cat]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cat = e.currentTarget.getAttribute('data-cat');
        activeCategoryFilter = cat;
        renderCategoryUI();
        renderPasswordCards();
      });
    });

    document.getElementById('btnAddCategoryDesktop')?.addEventListener('click', () => {
      document.getElementById('categoryForm').reset();
      openModal('categoryModal');
    });
  }

  if (modalSelect) {
    modalSelect.innerHTML = customCategories.map(cat => 
      `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`
    ).join('');
  }
}

// Bind UI Events
function bindEvents() {
  // Auth Tab Switcher with URL Routing (/login vs /register)
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  tabLogin.addEventListener('click', () => {
    navigateTo('/login');
  });

  tabRegister.addEventListener('click', () => {
    navigateTo('/register');
  });

  // Login Form Submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) return;

    showToast('🔑 Đang kiểm tra xác thực tài khoản...', 'info');

    try {
      const authHash = await deriveAuthHash(username, password);
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, auth_hash: authHash })
      });

      const data = await res.json();
      if (!data.success) {
        showToast(`❌ Lỗi đăng nhập: ${data.error}`, 'danger');
        return;
      }

      // Check if logged in user is dedicated ADMIN (No KDBX decryption needed!)
      if (data.username.toLowerCase() === 'admin') {
        currentDb = null;
        currentUsername = 'admin';
        currentMasterPassword = password;
        currentAuthHash = authHash;

        onAdminLoginSuccess();
        return;
      }

      // Normal User: Convert Base64 KDBX to ArrayBuffer & Unlock
      const arrayBuffer = base64ToArrayBuffer(data.kdbx_base64);
      const db = await unlockKdbxVault(arrayBuffer, password);

      // Save state
      currentDb = db;
      currentUsername = data.username;
      currentMasterPassword = password;
      currentAuthHash = authHash;

      onLoginSuccess();
    } catch (err) {
      showToast(`❌ Không thể đăng nhập: Mật khẩu không chính xác hoặc tệp lỗi!`, 'danger');
      console.error(err);
    }
  });

  // Real-time username duplicate check on register form
  const regUsernameInput = document.getElementById('regUsername');
  const regUsernameHint = document.getElementById('regUsernameHint');
  let isUsernameDuplicate = false;
  let usernameCheckTimeout = null;

  if (regUsernameInput) {
    regUsernameInput.addEventListener('input', (e) => {
      const val = e.target.value.trim().toLowerCase();
      if (usernameCheckTimeout) clearTimeout(usernameCheckTimeout);

      if (!val) {
        if (regUsernameHint) regUsernameHint.style.display = 'none';
        isUsernameDuplicate = false;
        return;
      }

      if (val === 'admin') {
        isUsernameDuplicate = true;
        if (regUsernameHint) {
          regUsernameHint.style.display = 'block';
          regUsernameHint.style.color = 'var(--neon-pink)';
          regUsernameHint.innerText = '⚠️ Tên tài khoản "admin" là tài khoản quản trị hệ thống.';
        }
        return;
      }

      usernameCheckTimeout = setTimeout(async () => {
        try {
          const res = await fetch(`${API_BASE}/auth/check-username?username=${encodeURIComponent(val)}`);
          const data = await res.json();

          if (data.exists) {
            isUsernameDuplicate = true;
            if (regUsernameHint) {
              regUsernameHint.style.display = 'block';
              regUsernameHint.style.color = 'var(--neon-pink)';
              regUsernameHint.innerText = `⚠️ Tên tài khoản '${val}' đã tồn tại trên máy chủ!`;
            }
          } else {
            isUsernameDuplicate = false;
            if (regUsernameHint) {
              regUsernameHint.style.display = 'block';
              regUsernameHint.style.color = 'var(--neon-emerald)';
              regUsernameHint.innerText = `✓ Tên tài khoản '${val}' hợp lệ và có thể đăng ký.`;
            }
          }
        } catch (err) {
          console.error(err);
        }
      }, 300);
    });
  }

  // Register Form Submit
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;

    if (!username || !password) return;

    if (username.toLowerCase() === 'admin') {
      showToast('⚠️ Tên tài khoản "admin" là tài khoản hệ thống không thể đăng ký mới!', 'danger');
      return;
    }

    if (isUsernameDuplicate) {
      showToast(`⚠️ Tên tài khoản '${username}' đã tồn tại trên máy chủ! Vui lòng chọn tên khác.`, 'danger');
      return;
    }

    // Early Check on Server before KDBX generation
    try {
      const checkRes = await fetch(`${API_BASE}/auth/check-username?username=${encodeURIComponent(username)}`);
      const checkData = await checkRes.json();
      if (checkData.exists) {
        showToast(`⚠️ Tên tài khoản '${username}' đã tồn tại trên máy chủ! Vui lòng chọn tên đăng nhập khác.`, 'danger');
        if (regUsernameHint) {
          regUsernameHint.style.display = 'block';
          regUsernameHint.style.color = 'var(--neon-pink)';
          regUsernameHint.innerText = `⚠️ Tên tài khoản '${username}' đã tồn tại trên máy chủ!`;
        }
        return;
      }
    } catch (err) {
      console.error(err);
    }

    showToast('⚙️ Đang khởi tạo tệp .kdbx chuẩn KeePass...', 'info');

    try {
      const authHash = await deriveAuthHash(username, password);
      const { db, arrayBuffer } = await createNewKdbxVault(username, password);
      
      // Convert to base64 safely
      const kdbxBase64 = arrayBufferToBase64(arrayBuffer);

      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          auth_hash: authHash,
          initial_kdbx_base64: kdbxBase64
        })
      });

      const data = await res.json();
      if (!data.success) {
        showToast(`⚠️ Tên tài khoản không thể đăng ký: ${data.error}`, 'danger');
        return;
      }

      showToast(`✅ Tạo tài khoản '${username}' thành công! Đang tự động đăng nhập...`, 'success');

      currentDb = db;
      currentUsername = username;
      currentMasterPassword = password;
      currentAuthHash = authHash;

      onLoginSuccess();
    } catch (err) {
      showToast(`❌ Lỗi khởi tạo kho KDBX: ${err.message}`, 'danger');
      console.error(err);
    }
  });

  // View Mode Switcher (Grid vs List View)
  const btnViewGrid = document.getElementById('btnViewGrid');
  const btnViewList = document.getElementById('btnViewList');

  if (btnViewGrid && btnViewList) {
    if (currentViewMode === 'list') {
      btnViewList.classList.add('active');
      btnViewGrid.classList.remove('active');
    } else {
      btnViewGrid.classList.add('active');
      btnViewList.classList.remove('active');
    }

    btnViewGrid.addEventListener('click', () => {
      currentViewMode = 'grid';
      localStorage.setItem('vault_view_mode', 'grid');
      btnViewGrid.classList.add('active');
      btnViewList.classList.remove('active');
      renderPasswordCards();
    });

    btnViewList.addEventListener('click', () => {
      currentViewMode = 'list';
      localStorage.setItem('vault_view_mode', 'list');
      btnViewList.classList.add('active');
      btnViewGrid.classList.remove('active');
      renderPasswordCards();
    });
  }

  // Header Dropdown Menu Toggle (Exclusive)
  const btnVaultDropdown = document.getElementById('btnVaultDropdown');
  const vaultDropdownMenu = document.getElementById('vaultDropdownMenu');
  const btnMobileMenu = document.getElementById('btnMobileMenu');
  const mobileMenuPanel = document.getElementById('mobileMenuPanel');
  const mobileSearchInput = document.getElementById('mobileSearchInput');

  if (btnVaultDropdown && vaultDropdownMenu) {
    btnVaultDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      if (mobileMenuPanel) {
        mobileMenuPanel.classList.add('hidden');
        if (btnMobileMenu) btnMobileMenu.classList.remove('active');
      }

      vaultDropdownMenu.classList.toggle('hidden');
      btnVaultDropdown.classList.toggle('active');
    });
  }

  // Mobile Hamburger Menu
  if (btnMobileMenu && mobileMenuPanel) {
    btnMobileMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      if (vaultDropdownMenu) {
        vaultDropdownMenu.classList.add('hidden');
        if (btnVaultDropdown) btnVaultDropdown.classList.remove('active');
      }

      mobileMenuPanel.classList.toggle('hidden');
      btnMobileMenu.classList.toggle('active');
    });

    if (mobileSearchInput) {
      mobileSearchInput.addEventListener('input', (e) => {
        const desktopSearch = document.getElementById('searchInput');
        if (desktopSearch) desktopSearch.value = e.target.value;
        renderPasswordCards();
      });
    }

    document.getElementById('btnAddCategoryMobile')?.addEventListener('click', () => {
      mobileMenuPanel.classList.add('hidden');
      btnMobileMenu.classList.remove('active');
      document.getElementById('categoryForm').reset();
      openModal('categoryModal');
    });
  }

  // Go to Admin Page
  document.getElementById('btnGoAdmin')?.addEventListener('click', () => {
    vaultDropdownMenu.classList.add('hidden');
    btnVaultDropdown.classList.remove('active');
    navigateTo('/admin');
  });

  // Back to Database Page
  document.getElementById('btnBackToDatabase')?.addEventListener('click', () => {
    navigateTo('/database');
  });

  // Category Modal Handlers
  document.getElementById('btnCloseCategoryModal').addEventListener('click', () => closeModal('categoryModal'));
  document.getElementById('categoryForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('newCategoryName').value.trim();
    if (!name) return;

    if (!customCategories.includes(name)) {
      customCategories.push(name);
      localStorage.setItem('vault_custom_categories', JSON.stringify(customCategories));
      showToast(`➕ Đã thêm danh mục mới '${name}'!`, 'success');
    }

    activeCategoryFilter = name;
    renderCategoryUI();
    renderPasswordCards();
    closeModal('categoryModal');
  });

  // Close dropdowns on click outside
  window.addEventListener('click', (e) => {
    if (vaultDropdownMenu && !vaultDropdownMenu.contains(e.target) && !btnVaultDropdown.contains(e.target)) {
      vaultDropdownMenu.classList.add('hidden');
      btnVaultDropdown.classList.remove('active');
    }
    if (mobileMenuPanel && !mobileMenuPanel.contains(e.target) && !btnMobileMenu.contains(e.target)) {
      mobileMenuPanel.classList.add('hidden');
      btnMobileMenu.classList.remove('active');
    }
  });

  // Logout inside Dropdown
  document.getElementById('btnLogout').addEventListener('click', lockVault);

  // Search filter (Desktop)
  document.getElementById('searchInput').addEventListener('input', (e) => {
    if (mobileSearchInput) mobileSearchInput.value = e.target.value;
    renderPasswordCards();
  });

  // Sort Toggle Icon Buttons (Time & Alphabet)
  updateSortButtonUI();

  const btnSortTime = document.getElementById('btnSortTime');
  const btnSortAlpha = document.getElementById('btnSortAlpha');
  const btnSortTimeMobile = document.getElementById('btnSortTimeMobile');
  const btnSortAlphaMobile = document.getElementById('btnSortAlphaMobile');

  const handleSortTime = () => {
    if (currentSortMode === 'time-desc') {
      currentSortMode = 'time-asc';
      showToast('🕒 Sắp xếp: Cũ nhất trước', 'info');
    } else {
      currentSortMode = 'time-desc';
      showToast('🕒 Sắp xếp: Mới nhất trước', 'info');
    }
    localStorage.setItem('vault_sort_mode', currentSortMode);
    updateSortButtonUI();
    renderPasswordCards();
  };

  const handleSortAlpha = () => {
    if (currentSortMode === 'alpha-asc') {
      currentSortMode = 'alpha-desc';
      showToast('🔤 Sắp xếp: Alphabet (Z → A)', 'info');
    } else {
      currentSortMode = 'alpha-asc';
      showToast('🔤 Sắp xếp: Alphabet (A → Z)', 'info');
    }
    localStorage.setItem('vault_sort_mode', currentSortMode);
    updateSortButtonUI();
    renderPasswordCards();
  };

  btnSortTime?.addEventListener('click', handleSortTime);
  btnSortTimeMobile?.addEventListener('click', handleSortTime);

  btnSortAlpha?.addEventListener('click', handleSortAlpha);
  btnSortAlphaMobile?.addEventListener('click', handleSortAlpha);

  // Toggle Entry Password Input Visibility (Modal Eye Button)
  const btnToggleEntryPassword = document.getElementById('btnToggleEntryPassword');
  const entryPasswordInput = document.getElementById('entryPassword');

  btnToggleEntryPassword.addEventListener('click', () => {
    if (entryPasswordInput.classList.contains('unmasked')) {
      entryPasswordInput.classList.remove('unmasked');
      btnToggleEntryPassword.innerText = '👁️';
    } else {
      entryPasswordInput.classList.add('unmasked');
      btnToggleEntryPassword.innerText = '🙈';
    }
  });

  // Real-time Password Strength Meter Listener
  entryPasswordInput.addEventListener('input', (e) => {
    updatePasswordStrengthMeter(e.target.value);
  });

  // Hotkey Ctrl+K for search
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('searchInput').focus();
    }
    if (e.key === 'Escape') {
      closeModals();
      vaultDropdownMenu.classList.add('hidden');
      btnVaultDropdown.classList.remove('active');
      if (mobileMenuPanel) mobileMenuPanel.classList.add('hidden');
    }
  });

  // 1-Click KDBX Export
  document.getElementById('btnExportKdbx').addEventListener('click', async () => {
    if (!currentDb) return;
    showToast(`💾 Đang tải xuống tệp ${currentUsername}.kdbx...`, 'info');
    await downloadKdbxFile(currentDb, `${currentUsername}.kdbx`);
    showToast(`✅ Đã xuất tệp ${currentUsername}.kdbx thành công! Bạn có thể mở trực tiếp bằng phần mềm KeePass với mật khẩu tài khoản.`, 'success');
  });

  // Change Master Password Modal Triggers
  document.getElementById('btnOpenChangePass').addEventListener('click', () => {
    vaultDropdownMenu.classList.add('hidden');
    btnVaultDropdown.classList.remove('active');
    document.getElementById('changeMasterPasswordForm').reset();
    openModal('changeMasterPasswordModal');
  });

  document.getElementById('btnCloseChangePassModal').addEventListener('click', () => closeModal('changeMasterPasswordModal'));

  // Change Master Password Form Submit
  document.getElementById('changeMasterPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPass = document.getElementById('currentMasterPass').value;
    const newPass = document.getElementById('newMasterPass').value;
    const confirmPass = document.getElementById('confirmNewMasterPass').value;

    if (currentPass !== currentMasterPassword) {
      showToast('❌ Mật khẩu hiện tại không chính xác!', 'danger');
      return;
    }

    if (newPass !== confirmPass) {
      showToast('❌ Mật khẩu mới và mật khẩu xác nhận không khớp!', 'danger');
      return;
    }

    if (newPass.length < 6) {
      showToast('❌ Mật khẩu mới phải có ít nhất 6 ký tự!', 'danger');
      return;
    }

    showToast('🔑 Đang cập nhật mật khẩu mới cho tệp .kdbx...', 'info');

    try {
      // 1. Change Master Password in KDBX DB instance
      await changeMasterPasswordInDb(currentDb, newPass);

      // 2. Serialize new KDBX DB to base64
      const { base64 } = await serializeKdbxVault(currentDb);

      // 3. Compute new AuthHash
      const newAuthHash = await deriveAuthHash(currentUsername, newPass);

      // 4. Send change password request to Server
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUsername,
          current_auth_hash: currentAuthHash,
          new_auth_hash: newAuthHash,
          kdbx_base64: base64
        })
      });

      const data = await res.json();
      if (!data.success) {
        showToast(`❌ Lỗi cập nhật máy chủ: ${data.error}`, 'danger');
        return;
      }

      // Update local state
      currentMasterPassword = newPass;
      currentAuthHash = newAuthHash;

      closeModal('changeMasterPasswordModal');
      showToast('✅ Đổi mật khẩu kho .kdbx thành công! Tất cả dữ liệu đã được mã hóa lại bằng mật khẩu mới.', 'success');
    } catch (err) {
      showToast(`❌ Lỗi đổi mật khẩu: ${err.message}`, 'danger');
      console.error(err);
    }
  });

  // Change Admin Password Modal Triggers
  document.getElementById('btnOpenAdminChangePass')?.addEventListener('click', () => {
    vaultDropdownMenu.classList.add('hidden');
    btnVaultDropdown.classList.remove('active');
    document.getElementById('adminChangePassForm').reset();
    openModal('adminChangePassModal');
  });

  document.getElementById('btnCloseAdminChangePassModal')?.addEventListener('click', () => closeModal('adminChangePassModal'));

  // Change Admin Password Form Submit
  document.getElementById('adminChangePassForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPass = document.getElementById('currentAdminPass').value;
    const newPass = document.getElementById('newAdminPass').value;
    const confirmPass = document.getElementById('confirmNewAdminPass').value;

    if (currentPass !== currentMasterPassword) {
      showToast('❌ Mật khẩu admin hiện tại không chính xác!', 'danger');
      return;
    }

    if (newPass !== confirmPass) {
      showToast('❌ Mật khẩu mới và mật khẩu xác nhận không khớp!', 'danger');
      return;
    }

    if (newPass.length < 6) {
      showToast('❌ Mật khẩu mới phải có ít nhất 6 ký tự!', 'danger');
      return;
    }

    showToast('🔑 Đang cập nhật mật khẩu mới cho tài khoản Admin...', 'info');

    try {
      const currentAuthHash = await deriveAuthHash('admin', currentPass);
      const newAuthHash = await deriveAuthHash('admin', newPass);

      const res = await fetch(`${API_BASE}/admin/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin',
          current_auth_hash: currentAuthHash,
          new_auth_hash: newAuthHash
        })
      });

      const data = await res.json();
      if (!data.success) {
        showToast(`❌ Lỗi cập nhật: ${data.error}`, 'danger');
        return;
      }

      currentMasterPassword = newPass;
      closeModal('adminChangePassModal');
      showToast('✅ Đã cập nhật mật khẩu Admin mới thành công!', 'success');
    } catch (err) {
      showToast(`❌ Lỗi đổi mật khẩu admin: ${err.message}`, 'danger');
      console.error(err);
    }
  });

  // Entry Modal Triggers
  document.getElementById('btnNewEntry').addEventListener('click', () => {
    document.getElementById('modalTitle').innerText = 'THÊM MẬT KHẨU MỚI';
    document.getElementById('entryForm').reset();
    document.getElementById('entryUuid').value = '';
    entryPasswordInput.classList.remove('unmasked');
    btnToggleEntryPassword.innerText = '👁️';
    updatePasswordStrengthMeter('');
    renderCategoryUI();
    openModal('entryModal');
  });

  document.getElementById('btnCloseEntryModal').addEventListener('click', () => closeModal('entryModal'));

  // Entry Form Submit (Add / Edit)
  document.getElementById('entryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const uuid = document.getElementById('entryUuid').value;
    const title = document.getElementById('entryTitle').value.trim();
    const username = document.getElementById('entryUsername').value.trim();
    const password = document.getElementById('entryPassword').value;
    const url = document.getElementById('entryUrl').value.trim();
    const category = document.getElementById('entryCategory').value;
    const notes = document.getElementById('entryNotes').value.trim();

    // Domain Extension Validation
    if (url && !isValidWebAddress(url)) {
      showToast('❌ Địa chỉ website không hợp lệ! Vui lòng nhập tên miền có phần mở rộng (VD: google.com, facebook.com, app.vn).', 'danger');
      document.getElementById('entryUrl').focus();
      return;
    }

    if (uuid) {
      updateEntryInDb(currentDb, uuid, { title, username, password, url, notes, category });
      showToast('✏️ Đã cập nhật mật khẩu thành công!', 'success');
    } else {
      addEntryToDb(currentDb, { title, username, password, url, notes, category });
      showToast('➕ Đã thêm mật khẩu mới vào KDBX Vault!', 'success');
    }

    closeModal('entryModal');
    renderPasswordCards();
    await syncVaultToServer();
  });

  // Password Generator Modal
  document.getElementById('btnOpenGenerator').addEventListener('click', () => {
    vaultDropdownMenu.classList.add('hidden');
    btnVaultDropdown.classList.remove('active');
    generateRandomPassword();
    openModal('generatorModal');
  });

  document.getElementById('btnCloseGenModal').addEventListener('click', () => closeModal('generatorModal'));
  document.getElementById('btnRegenerate').addEventListener('click', generateRandomPassword);
  document.getElementById('genLength').addEventListener('input', (e) => {
    document.getElementById('genLengthVal').innerText = e.target.value;
    generateRandomPassword();
  });

  document.getElementById('btnCopyGen').addEventListener('click', () => {
    const pwd = document.getElementById('genResult').value;
    copyToClipboardWithAutoClear('Password', pwd);
  });

  // Reset inactivity timer on explicit user interaction (click / keypress)
  window.addEventListener('click', resetInactivityTimer);
  window.addEventListener('keypress', resetInactivityTimer);
}

// Domain Extension Validator (Requires .com, .vn, .org, .net, etc. or http/https)
function isValidWebAddress(url) {
  if (!url) return true;
  const trimmed = url.trim();
  // Validates domain extension (e.g. google.com, facebook.vn, my-app.io, http(s)://...)
  const domainRegex = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z0-9-]{2,}(\/.*)?$/i;
  return domainRegex.test(trimmed) || /^https?:\/\/localhost(:\d+)?(\/.*)?$/i.test(trimmed);
}

// Real-time Password Strength Meter Calculation
function updatePasswordStrengthMeter(pwd) {
  const b1 = document.getElementById('sBar1');
  const b2 = document.getElementById('sBar2');
  const b3 = document.getElementById('sBar3');

  if (!b1 || !b2 || !b3) return;

  b1.className = 'strength-bar';
  b2.className = 'strength-bar';
  b3.className = 'strength-bar';

  if (!pwd) return;

  let score = 0;
  if (pwd.length >= 6) score++;
  if (pwd.length >= 10 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) score++;
  if (pwd.length >= 12 && /[^A-Za-z0-9]/.test(pwd)) score++;

  if (score >= 1) b1.classList.add('weak');
  if (score >= 2) {
    b1.classList.add('medium');
    b2.classList.add('medium');
  }
  if (score >= 3) {
    b1.classList.add('strong');
    b2.classList.add('strong');
    b3.classList.add('strong');
  }
}

// Utility: Format Website URL for clean display & clickable href
function formatHref(url) {
  if (!url) return '';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return 'https://' + trimmed;
}

// On successful authentication (Normal Users)
function onLoginSuccess() {
  document.getElementById('activeVaultFilename').innerText = `${currentUsername}.kdbx`;
  document.getElementById('dropdownUsername').innerText = currentUsername.toUpperCase();
  document.getElementById('dropdownFilename').innerText = `${currentUsername}.kdbx`;

  // Show normal vault menu options
  document.getElementById('btnOpenChangePass')?.classList.remove('hidden');
  document.getElementById('btnOpenGenerator')?.classList.remove('hidden');
  document.getElementById('btnExportKdbx')?.classList.remove('hidden');
  document.getElementById('btnGoAdmin')?.classList.add('hidden');

  renderCategoryUI();
  renderPasswordCards();
  startAutoLockTimer();
  navigateTo('/database');
  showToast(`🔒 Chào mừng ${currentUsername}! Kho KDBX của bạn đã sẵn sàng.`, 'success');
}

// On successful authentication (Dedicated Admin)
function onAdminLoginSuccess() {
  document.getElementById('activeVaultFilename').innerText = `SYSTEM ADMIN`;
  document.getElementById('dropdownUsername').innerText = `ADMINISTRATOR`;
  document.getElementById('dropdownFilename').innerText = `SERVER CONTROL`;

  // Hide normal vault menu items & show Admin Change Password
  document.getElementById('btnOpenChangePass')?.classList.add('hidden');
  document.getElementById('btnOpenAdminChangePass')?.classList.remove('hidden');
  document.getElementById('btnOpenGenerator')?.classList.add('hidden');
  document.getElementById('btnExportKdbx')?.classList.add('hidden');
  document.getElementById('btnGoAdmin')?.classList.add('hidden');

  startAutoLockTimer();
  navigateTo('/admin');
  showToast(`🛡️ Đăng nhập hệ thống Admin thành công!`, 'success');
}

// Update Sort Buttons UI Active States & Directional Arrow Icons (↑ ↓)
function updateSortButtonUI() {
  const btnSortTime = document.getElementById('btnSortTime');
  const btnSortAlpha = document.getElementById('btnSortAlpha');
  const btnSortTimeMobile = document.getElementById('btnSortTimeMobile');
  const btnSortAlphaMobile = document.getElementById('btnSortAlphaMobile');

  const isTime = currentSortMode === 'time-desc' || currentSortMode === 'time-asc';
  const isAlpha = currentSortMode === 'alpha-asc' || currentSortMode === 'alpha-desc';

  if (btnSortTime) {
    btnSortTime.classList.toggle('active', isTime);
    if (currentSortMode === 'time-asc') {
      btnSortTime.innerHTML = '🕒 ↑';
      btnSortTime.title = 'Sắp xếp thời gian: Cũ nhất trước (Click để đổi sang Mới nhất)';
    } else {
      btnSortTime.innerHTML = '🕒 ↓';
      btnSortTime.title = 'Sắp xếp thời gian: Mới nhất trước (Click để đổi sang Cũ nhất)';
    }
  }

  if (btnSortAlpha) {
    btnSortAlpha.classList.toggle('active', isAlpha);
    if (currentSortMode === 'alpha-desc') {
      btnSortAlpha.innerHTML = '🔤 ↑';
      btnSortAlpha.title = 'Sắp xếp Alphabet: Z → A (Click để đổi sang A → Z)';
    } else {
      btnSortAlpha.innerHTML = '🔤 ↓';
      btnSortAlpha.title = 'Sắp xếp Alphabet: A → Z (Click để đổi sang Z → A)';
    }
  }

  if (btnSortTimeMobile) {
    btnSortTimeMobile.classList.toggle('active', isTime);
    btnSortTimeMobile.innerHTML = currentSortMode === 'time-asc' ? '🕒 Cũ Nhất ↑' : '🕒 Mới Nhất ↓';
  }

  if (btnSortAlphaMobile) {
    btnSortAlphaMobile.classList.toggle('active', isAlpha);
    btnSortAlphaMobile.innerHTML = currentSortMode === 'alpha-desc' ? '🔤 Z → A ↑' : '🔤 A → Z ↓';
  }
}

// Render Password Cards Grid
function renderPasswordCards() {
  if (!currentDb) return;

  const container = document.getElementById('passwordGrid');
  if (currentViewMode === 'list') {
    container.classList.add('view-list');
  } else {
    container.classList.remove('view-list');
  }

  const desktopQuery = document.getElementById('searchInput')?.value || '';
  const mobileQuery = document.getElementById('mobileSearchInput')?.value || '';
  const query = (mobileQuery || desktopQuery).toLowerCase().trim();

  entriesList = getAllEntries(currentDb);

  const filtered = entriesList.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(query) ||
      item.username.toLowerCase().includes(query) ||
      item.url.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query);

    const matchesCategory = (activeCategoryFilter === 'ALL') || 
      (item.category && item.category.toLowerCase() === activeCategoryFilter.toLowerCase());

    return matchesSearch && matchesCategory;
  });

  // Apply Sort Mode
  filtered.sort((a, b) => {
    if (currentSortMode === 'time-desc') {
      const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tB - tA;
    } else if (currentSortMode === 'time-asc') {
      const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tA - tB;
    } else if (currentSortMode === 'alpha-asc') {
      const cmpTitle = a.title.localeCompare(b.title, 'vi', { sensitivity: 'base' });
      if (cmpTitle !== 0) return cmpTitle;
      return a.username.localeCompare(b.username, 'vi', { sensitivity: 'base' });
    } else if (currentSortMode === 'alpha-desc') {
      const cmpTitle = b.title.localeCompare(a.title, 'vi', { sensitivity: 'base' });
      if (cmpTitle !== 0) return cmpTitle;
      return b.username.localeCompare(a.username, 'vi', { sensitivity: 'base' });
    }
    return 0;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:3rem; color:var(--text-muted); font-family:var(--font-mono)">
        <p style="font-size:1.2rem; margin-bottom:0.5rem">🔍 Không tìm thấy mật khẩu nào</p>
        <p style="font-size:0.85rem">Nhấn "+ THÊM MẬT KHẨU" để bắt đầu lưu giữ tài khoản.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(item => {
    const formattedDate = item.updatedAt
      ? new Date(item.updatedAt).toLocaleString('vi-VN', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })
      : 'Vừa tạo';

    return `
      <div class="pwd-card">
        <div class="card-top">
          <div style="overflow:hidden;">
            <div class="card-title">${escapeHtml(item.title)}</div>
            <div class="card-subtitle">${escapeHtml(item.username)}</div>
            <span class="card-category">${escapeHtml(item.category)}</span>
          </div>
        </div>

        <div class="pwd-field">
          <div>
            <span class="label">USER: </span>
            <span class="value">${escapeHtml(item.username)}</span>
          </div>
        </div>

        <div class="pwd-field">
          <div>
            <span class="label">PASS: </span>
            <span class="value pwd-text" data-hidden="true" data-pwd="${escapeHtml(item.password)}" style="font-size:1.1rem; letter-spacing:2px;">••••••••</span>
          </div>
          <div style="display:flex; gap:0.2rem; align-items:center;">
            <button class="copy-btn btn-toggle-pwd" title="Hiện/Ẩn mật khẩu">👁️</button>
          </div>
        </div>

        ${item.url ? `
          <div class="pwd-url-row" style="margin-top:0.4rem; font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            <a href="${escapeHtml(formatHref(item.url))}" target="_blank" rel="noopener" style="color:var(--neon-cyan); text-decoration:none;">🔗 ${escapeHtml(item.url)}</a>
          </div>
        ` : ''}

        <div class="card-updated-time">
          <span>🕒 Cập nhật lần cuối:</span>
          <strong style="color:var(--text-secondary);">${formattedDate}</strong>
        </div>

        <div class="card-actions">
          <button class="icon-btn btn-edit" data-uuid="${item.uuid}" title="Chỉnh sửa">✏️</button>
          <button class="icon-btn danger btn-delete" data-uuid="${item.uuid}" title="Xóa">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  // Bind Eye Toggle buttons on Cards
  container.querySelectorAll('.btn-toggle-pwd').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pwdField = e.currentTarget.parentElement.previousElementSibling.querySelector('.pwd-text');
      const isHidden = pwdField.getAttribute('data-hidden') === 'true';
      if (isHidden) {
        pwdField.innerText = pwdField.getAttribute('data-pwd');
        pwdField.setAttribute('data-hidden', 'false');
        pwdField.style.letterSpacing = 'normal';
        e.currentTarget.innerText = '🙈';
      } else {
        pwdField.innerText = '••••••••';
        pwdField.setAttribute('data-hidden', 'true');
        pwdField.style.letterSpacing = '2px';
        e.currentTarget.innerText = '👁️';
      }
    });
  });

  // Bind Edit buttons
  container.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const uuid = e.currentTarget.getAttribute('data-uuid');
      const entry = entriesList.find(x => x.uuid === uuid);
      if (entry) {
        document.getElementById('modalTitle').innerText = 'CHỈNH SỬA MẬT KHẨU';
        document.getElementById('entryUuid').value = entry.uuid;
        document.getElementById('entryTitle').value = entry.title;
        document.getElementById('entryUsername').value = entry.username;
        document.getElementById('entryPassword').value = entry.password;
        document.getElementById('entryPassword').classList.remove('unmasked');
        document.getElementById('btnToggleEntryPassword').innerText = '👁️';
        document.getElementById('entryUrl').value = entry.url;
        renderCategoryUI();
        document.getElementById('entryCategory').value = entry.category || 'Websites';
        document.getElementById('entryNotes').value = entry.notes;

        updatePasswordStrengthMeter(entry.password);
        openModal('entryModal');
      }
    });
  });

  // Bind Delete buttons
  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const uuid = e.currentTarget.getAttribute('data-uuid');
      if (confirm('Bạn có chắc chắn muốn xóa mục mật khẩu này khỏi KDBX Vault?')) {
        deleteEntryFromDb(currentDb, uuid);
        showToast('🗑️ Đã xóa mục mật khẩu!', 'info');
        renderPasswordCards();
        await syncVaultToServer();
      }
    });
  });
}

// Sync Vault to Server DB
async function syncVaultToServer() {
  if (!currentDb || !currentUsername || !currentAuthHash) return;

  try {
    const { base64 } = await serializeKdbxVault(currentDb);
    const res = await fetch(`${API_BASE}/vault/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUsername,
        auth_hash: currentAuthHash,
        kdbx_base64: base64
      })
    });

    const data = await res.json();
    if (data.success) {
      console.log('[Vault Sync] Synced successfully at', data.updated_at);
    }
  } catch (err) {
    console.error('[Vault Sync Error]', err);
  }
}

// Copy to Clipboard with 10s Auto-Clear
function copyToClipboardWithAutoClear(type, text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`📋 Đã copy ${type}! Tự động xóa clipboard sau 10 giây...`, 'success');
    setTimeout(() => {
      navigator.clipboard.writeText('');
    }, 10000);
  });
}

// Password Generator logic
function generateRandomPassword() {
  const length = parseInt(document.getElementById('genLength').value);
  const incUpper = document.getElementById('genUpper').checked;
  const incLower = document.getElementById('genLower').checked;
  const incNumbers = document.getElementById('genNumbers').checked;
  const incSymbols = document.getElementById('genSymbols').checked;

  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  let pool = '';
  if (incUpper) pool += upper;
  if (incLower) pool += lower;
  if (incNumbers) pool += numbers;
  if (incSymbols) pool += symbols;

  if (!pool) pool = lower + numbers;

  let pwd = '';
  const cryptoObj = window.crypto || window.msCrypto;
  const randomValues = new Uint32Array(length);
  cryptoObj.getRandomValues(randomValues);

  for (let i = 0; i < length; i++) {
    pwd += pool[randomValues[i] % pool.length];
  }

  document.getElementById('genResult').value = pwd;
}

// Auto-Lock Inactivity Timer
function startAutoLockTimer() {
  lockSecondsRemaining = LOCK_TIMEOUT_SECONDS;
  if (autoLockTimer) clearInterval(autoLockTimer);

  autoLockTimer = setInterval(() => {
    lockSecondsRemaining--;
    const mins = Math.floor(lockSecondsRemaining / 60).toString().padStart(2, '0');
    const secs = (lockSecondsRemaining % 60).toString().padStart(2, '0');
    const displayTime = `${mins}:${secs}`;
    
    const lockTimerEl = document.getElementById('lockTimer');
    const headerLockTimerEl = document.getElementById('headerLockTimer');

    if (lockTimerEl) lockTimerEl.innerText = displayTime;
    if (headerLockTimerEl) headerLockTimerEl.innerText = displayTime;

    if (lockSecondsRemaining <= 0) {
      lockVault();
      showToast('🔒 Tự động khóa do không có tương tác để bảo vệ dữ liệu!', 'info');
    }
  }, 1000);
}

function resetInactivityTimer() {
  lockSecondsRemaining = LOCK_TIMEOUT_SECONDS;
  const mins = Math.floor(lockSecondsRemaining / 60).toString().padStart(2, '0');
  const secs = (lockSecondsRemaining % 60).toString().padStart(2, '0');
  const displayTime = `${mins}:${secs}`;

  const lockTimerEl = document.getElementById('lockTimer');
  const headerLockTimerEl = document.getElementById('headerLockTimer');

  if (lockTimerEl) lockTimerEl.innerText = displayTime;
  if (headerLockTimerEl) headerLockTimerEl.innerText = displayTime;
}

function lockVault() {
  currentDb = null;
  currentUsername = '';
  currentMasterPassword = '';
  currentAuthHash = '';

  if (autoLockTimer) clearInterval(autoLockTimer);

  document.getElementById('loginPassword').value = '';
  document.getElementById('vaultDropdownMenu').classList.add('hidden');
  if (document.getElementById('mobileMenuPanel')) document.getElementById('mobileMenuPanel').classList.add('hidden');
  
  // Reset profile menu buttons
  document.getElementById('btnOpenChangePass')?.classList.remove('hidden');
  document.getElementById('btnOpenGenerator')?.classList.remove('hidden');
  document.getElementById('btnExportKdbx')?.classList.remove('hidden');
  document.getElementById('btnGoAdmin')?.classList.add('hidden');

  fetchUserList();
  navigateTo('/login');
}

// Utility: Modal controls
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function closeModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
}

// Utility: Toast notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}
