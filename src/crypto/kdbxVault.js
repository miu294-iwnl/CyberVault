import * as kdbxweb from 'kdbxweb';

/**
 * Converts ArrayBuffer to Base64 safely without stack overflow
 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000; // 32KB chunks
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

/**
 * Converts Base64 string to ArrayBuffer safely
 */
export function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derives an AuthHash from Master Password for Server Authentication.
 * Server receives AuthHash, but NEVER receives Master Password!
 */
export async function deriveAuthHash(username, masterPassword) {
  const encoder = new TextEncoder();
  const salt = `cyber_vault_${username.toLowerCase()}_auth_salt`;
  const data = encoder.encode(masterPassword + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Creates a brand new KDBX Database for a new user (Clean DB without sample entries)
 */
export async function createNewKdbxVault(username, masterPassword) {
  const passwordVal = kdbxweb.ProtectedValue.fromString(masterPassword);
  const credentials = new kdbxweb.Credentials(passwordVal);

  const db = kdbxweb.Kdbx.create(credentials, `${username.toUpperCase()} CYBER VAULT`);
  
  // Set KDF to AES-KDF so browser handles key derivation natively via Web Crypto API!
  db.setKdf(kdbxweb.Consts.KdfId.Aes);

  // Set default group (Clean, empty passwords group)
  const rootGroup = db.getDefaultGroup();
  rootGroup.name = `${username.toUpperCase()} Passwords`;

  const arrayBuffer = await db.save();
  return { db, arrayBuffer };
}

/**
 * Changes Master Password of an open KDBX Database
 */
export async function changeMasterPasswordInDb(db, newMasterPassword) {
  const passwordVal = kdbxweb.ProtectedValue.fromString(newMasterPassword);
  const credentials = new kdbxweb.Credentials(passwordVal);
  db.credentials = credentials;
  return db;
}

/**
 * Unlocks / Decrypts an existing KDBX ArrayBuffer using Master Password
 */
export async function unlockKdbxVault(arrayBuffer, masterPassword) {
  const passwordVal = kdbxweb.ProtectedValue.fromString(masterPassword);
  const credentials = new kdbxweb.Credentials(passwordVal);
  
  const db = await kdbxweb.Kdbx.load(arrayBuffer, credentials);
  return db;
}

/**
 * Serializes KDBX Database back to ArrayBuffer and Base64 string
 */
export async function serializeKdbxVault(db) {
  const arrayBuffer = await db.save();
  const base64 = arrayBufferToBase64(arrayBuffer);
  return { arrayBuffer, base64 };
}

/**
 * Triggers direct browser download of <username>.kdbx file
 */
export async function downloadKdbxFile(db, filename) {
  const arrayBuffer = await db.save();
  const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.kdbx') ? filename : `${filename}.kdbx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Gets all entries from KDBX Database
 */
export function getAllEntries(db) {
  const entries = [];

  function traverseGroup(group) {
    if (!group) return;
    
    for (const entry of group.entries) {
      const getField = (name) => {
        const val = entry.fields.get(name);
        return val ? (typeof val.getText === 'function' ? val.getText() : val) : '';
      };

      entries.push({
        uuid: entry.uuid.id,
        groupName: group.name,
        title: getField('Title') || 'Untitled',
        username: getField('UserName') || '',
        password: getField('Password') || '',
        url: getField('URL') || '',
        notes: getField('Notes') || '',
        category: getField('Category') || 'General',
        updatedAt: entry.times.lastModTime
      });
    }

    for (const subGroup of group.groups) {
      traverseGroup(subGroup);
    }
  }

  traverseGroup(db.getDefaultGroup());
  return entries;
}

/**
 * Adds a new entry to the KDBX Database
 */
export function addEntryToDb(db, { title, username, password, url, notes, category }) {
  const rootGroup = db.getDefaultGroup();
  const entry = db.createEntry(rootGroup);

  entry.fields.set('Title', kdbxweb.ProtectedValue.fromString(title));
  entry.fields.set('UserName', kdbxweb.ProtectedValue.fromString(username));
  entry.fields.set('Password', kdbxweb.ProtectedValue.fromString(password));
  entry.fields.set('URL', kdbxweb.ProtectedValue.fromString(url || ''));
  entry.fields.set('Notes', kdbxweb.ProtectedValue.fromString(notes || ''));
  entry.fields.set('Category', kdbxweb.ProtectedValue.fromString(category || 'General'));

  return entry;
}

/**
 * Updates an existing entry in KDBX Database by UUID
 */
export function updateEntryInDb(db, uuidStr, { title, username, password, url, notes, category }) {
  let foundEntry = null;

  function traverse(group) {
    if (!group) return;
    for (const entry of group.entries) {
      if (entry.uuid.id === uuidStr) {
        foundEntry = entry;
        return;
      }
    }
    for (const subGroup of group.groups) {
      traverse(subGroup);
    }
  }

  traverse(db.getDefaultGroup());

  if (foundEntry) {
    foundEntry.fields.set('Title', kdbxweb.ProtectedValue.fromString(title));
    foundEntry.fields.set('UserName', kdbxweb.ProtectedValue.fromString(username));
    foundEntry.fields.set('Password', kdbxweb.ProtectedValue.fromString(password));
    foundEntry.fields.set('URL', kdbxweb.ProtectedValue.fromString(url || ''));
    foundEntry.fields.set('Notes', kdbxweb.ProtectedValue.fromString(notes || ''));
    foundEntry.fields.set('Category', kdbxweb.ProtectedValue.fromString(category || 'General'));
    foundEntry.times.update();
    return true;
  }
  return false;
}

/**
 * Deletes an entry from KDBX Database by UUID
 */
export function deleteEntryFromDb(db, uuidStr) {
  function traverse(group) {
    if (!group) return false;
    for (let i = 0; i < group.entries.length; i++) {
      if (group.entries[i].uuid.id === uuidStr) {
        group.entries.splice(i, 1);
        return true;
      }
    }
    for (const subGroup of group.groups) {
      if (traverse(subGroup)) return true;
    }
    return false;
  }

  return traverse(db.getDefaultGroup());
}
