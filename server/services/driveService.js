const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const DRIVE_ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID;
const DRIVE_SECONDARY_FOLDER_ID = process.env.DRIVE_SECONDARY_FOLDER_ID;

// ── MIME lookup ────────────────────────────────────────────────────────────
const UPLOAD_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
};

function mimeForUpload(filename) {
  const ext = path.extname(filename).toLowerCase();
  return UPLOAD_MIME[ext] || 'application/octet-stream';
}

// ── Auth ───────────────────────────────────────────────────────────────────
// Uses OAuth2 with a long-lived refresh token.
// Required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
function getDriveClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      'Missing Google OAuth2 env vars. ' +
      'Run node scripts/getRefreshToken.js to obtain GOOGLE_REFRESH_TOKEN.'
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    'http://localhost:3001/oauth/callback'
  );

  oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Format a Date as DD.MM.YY */
function formatDate(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = String(date.getFullYear()).slice(-2);
  return `${d}.${m}.${y}`;
}

/**
 * Convert a 0-based index to a cycle letter.
 * 0→A, 1→B, …, 25→Z, 26→AA, 27→AB, …
 */
function indexToLetter(n) {
  let result = '';
  let i = n + 1; // work with 1-based
  while (i > 0) {
    i--;
    result = String.fromCharCode(65 + (i % 26)) + result;
    i = Math.floor(i / 26);
  }
  return result;
}

/**
 * Return true if folderName is a legacy folder for the given plate.
 * Legacy = contains the plate number as a standalone numeric token AND is not
 * a new-format גיוס/שחרור folder.
 *
 * Uses a digit-boundary check so that plate "826" does NOT match folders for
 * unrelated plates like "181826" or "8261" that happen to contain "826" as a
 * substring.
 *
 * Examples that match for plate "826":
 *   "826", "826-A", "A 826", "A-826", "A - 826 B"
 * Examples that do NOT match for plate "826":
 *   "181826-A", "8261-B", "826100"
 */
function isLegacyFolder(folderName, plate) {
  if (folderName.startsWith('גיוס ') || folderName.startsWith('שחרור ')) return false;
  // Plate must not be immediately preceded or followed by another digit
  const regex = new RegExp(`(^|[^0-9])${plate}([^0-9]|$)`);
  return regex.test(folderName);
}

/** Return true if folderName is a new-format enlistment folder for the plate */
function isEnlistmentFolder(folderName, plate) {
  return folderName.startsWith(`גיוס ${plate}-`);
}

/** Return true if folderName is a new-format release folder for the plate */
function isReleaseFolder(folderName, plate) {
  return folderName.startsWith(`שחרור ${plate}-`);
}

// ── Drive API helpers ──────────────────────────────────────────────────────

/**
 * List ALL folder names+IDs inside the root Drive folder (handles pagination).
 */
async function listRootFolders() {
  const drive = getDriveClient();
  const folders = [];
  let pageToken;

  do {
    const res = await drive.files.list({
      q: `'${DRIVE_ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'nextPageToken, files(id, name)',
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      ...(pageToken ? { pageToken } : {}),
    });
    folders.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return folders; // [{ id, name }, …]
}

/**
 * Create a folder directly inside the root Drive folder.
 * Returns { id, name }.
 */
async function createFolder(name, parentId) {
  const drive = getDriveClient();
  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id, name',
  });
  return { id: res.data.id, name: res.data.name };
}

/**
 * Find an existing subfolder by name inside parentId, or create it.
 * Returns the folder ID.
 */
async function findOrCreateSubfolder(name, parentId) {
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 1,
  });
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;
  const created = await createFolder(name, parentId);
  return created.id;
}

/**
 * Delete a Drive file/folder by ID.
 */
async function deleteFile(fileId) {
  const drive = getDriveClient();
  await drive.files.delete({ fileId, supportsAllDrives: true });
}

/**
 * Upload a single file to a Drive folder.
 * Returns the Drive file ID.
 */
async function uploadFile(localPath, filename, folderId) {
  const drive = getDriveClient();
  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType: mimeForUpload(filename),
      body: fs.createReadStream(localPath),
    },
    fields: 'id',
  });
  return res.data.id;
}

/**
 * Upload a file with up to maxRetries attempts (exponential back-off).
 */
async function uploadFileWithRetry(localPath, filename, folderId, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await uploadFile(localPath, filename, folderId);
    } catch (err) {
      lastError = err;
      console.error(`Upload attempt ${attempt} failed for ${filename}:`, err.message);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Upload photos in batches of `concurrency`.
 * Returns [{ filename, driveFileId, success, error }]
 *
 * onBatchComplete(batchResults) — optional async callback called after each
 * batch. Errors from the callback are logged but do NOT abort the upload.
 * Use this to persist driveFileIds incrementally so a mid-upload crash
 * leaves a recoverable state in the database.
 */
async function uploadPhotosBatch(photos, localDir, folderId, concurrency = 3, onBatchComplete = null) {
  const results = [];
  for (let i = 0; i < photos.length; i += concurrency) {
    const batch = photos.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (photo) => {
        const localPath = path.join(localDir, photo.filename);
        try {
          const driveFileId = await uploadFileWithRetry(
            localPath,
            photo.originalName || photo.filename,
            folderId
          );
          return { filename: photo.filename, driveFileId, success: true };
        } catch (err) {
          return { filename: photo.filename, success: false, error: err.message };
        }
      })
    );
    results.push(...batchResults);
    if (onBatchComplete) {
      try {
        await onBatchComplete(batchResults);
      } catch (cbErr) {
        // Non-fatal — upload continues even if progress save fails
        console.error('uploadPhotosBatch: onBatchComplete error (non-fatal):', cbErr.message);
      }
    }
  }
  return results;
}

// ── Approval concurrency lock ─────────────────────────────────────────────
// Prevents a race condition where two simultaneous approvals for the same
// plate+type both read Drive, see the same existing folders, and both try
// to create the same lettered folder (e.g. two "גיוס 181398-A" folders).
//
// This is an in-process async mutex. It works correctly for a single-server
// deployment. Each lock key is `${plate}:${type}`.

const _approvalLocks = new Map();

async function withApprovalLock(plate, type, fn) {
  const key = `${plate}:${type}`;
  // Wait for any existing lock to release before acquiring
  while (_approvalLocks.has(key)) {
    await _approvalLocks.get(key);
  }
  let release;
  const lock = new Promise((resolve) => { release = resolve; });
  _approvalLocks.set(key, lock);
  try {
    return await fn();
  } finally {
    _approvalLocks.delete(key);
    release();
  }
}

// ── Core approval logic ────────────────────────────────────────────────────

/**
 * Determine the next letter for an enlistment or release for this plate.
 *
 * Enlistment letter index = (legacy folders containing plate) + (existing גיוס {plate}-* folders)
 * Release letter index    = (existing שחרור {plate}-* folders)
 *
 * Legacy folders are any folder in root that contains the plate string but is
 * NOT a new-format גיוס/שחרור folder.
 */
function determineNextLetter(plate, type, rootFolders) {
  if (type === 'enlistment') {
    const legacyCount = rootFolders.filter((f) => isLegacyFolder(f.name, plate)).length;
    const existingCount = rootFolders.filter((f) => isEnlistmentFolder(f.name, plate)).length;
    return indexToLetter(legacyCount + existingCount);
  } else {
    const existingCount = rootFolders.filter((f) => isReleaseFolder(f.name, plate)).length;
    return indexToLetter(existingCount);
  }
}

/**
 * prepareApprovalFolder — Phase 1 of the approval flow.
 *
 * Determines the next letter, creates the Drive folder and subfolders,
 * and upserts the Vehicle record — all inside the per-plate approval lock
 * so concurrent approvals for the same plate never pick the same letter.
 *
 * Returns { vehicle, folderName, folderId, letter, docsFolderId, photosFolderId }
 *
 * Call this ONCE, save folderId to the inspection immediately, then upload
 * files separately so a crash mid-upload doesn't lose the folder reference.
 */
async function prepareApprovalFolder(inspection) {
  const { licensePlate, type } = inspection;

  return withApprovalLock(licensePlate, type, async () => {
    const Vehicle = require('../models/Vehicle');

    const typeHebrew = type === 'enlistment' ? 'גיוס' : 'שחרור';
    const dateStr = formatDate(new Date());

    const rootFolders = await listRootFolders();
    const letter = determineNextLetter(licensePlate, type, rootFolders);
    const folderName = `${typeHebrew} ${licensePlate}-${letter} ${dateStr}`;
    const { id: folderId } = await createFolder(folderName, DRIVE_ROOT_FOLDER_ID);

    // All files (documents + photos/videos) go directly into the inspection folder (flat structure)
    const docsFolderId = folderId;
    const photosFolderId = folderId;

    let vehicle = await Vehicle.findOne({ licensePlate });
    if (!vehicle) vehicle = new Vehicle({ licensePlate });
    vehicle.driveFolders.push({ folderId, folderName, type, createdAt: new Date() });
    await vehicle.save();

    return { vehicle, folderName, folderId, letter, docsFolderId, photosFolderId };
  });
}

/**
 * processApproval — called when a manager approves an inspection.
 *
 * 1. Lists all folders in Drive root to determine the correct letter.
 * 2. Creates a flat folder named:
 *      גיוס  {plate}-{letter} {DD.MM.YY}
 *      שחרור {plate}-{letter} {DD.MM.YY}
 * 3. Uploads photos (batched, with retries).
 * 4. Upserts the Vehicle document.
 *
 * Returns { vehicle, folderName, folderId, letter, uploadResults }
 */
async function processApproval(inspection, uploadsBaseDir) {
  const { licensePlate, type } = inspection;

  return withApprovalLock(licensePlate, type, async () => {
    const Vehicle = require('../models/Vehicle');

    const typeHebrew = type === 'enlistment' ? 'גיוס' : 'שחרור';
    const dateStr = formatDate(new Date());

    // 1. Scan root for existing folders (inside the lock — so concurrent calls
    //    for the same plate+type see the folder created by the first caller)
    const rootFolders = await listRootFolders();

    // 2. Determine letter
    const letter = determineNextLetter(licensePlate, type, rootFolders);

    // 3. Build folder name and create it
    const folderName = `${typeHebrew} ${licensePlate}-${letter} ${dateStr}`;
    const { id: folderId } = await createFolder(folderName, DRIVE_ROOT_FOLDER_ID);

    // 4. Upload photos
    const localDir = path.join(uploadsBaseDir, inspection._id.toString());
    const uploadResults = await uploadPhotosBatch(inspection.photos, localDir, folderId);

    // 5. Upsert vehicle record
    let vehicle = await Vehicle.findOne({ licensePlate });
    if (!vehicle) {
      vehicle = new Vehicle({ licensePlate });
    }
    vehicle.driveFolders.push({ folderId, folderName, type, createdAt: new Date() });
    await vehicle.save();

    return { vehicle, folderName, folderId, letter, uploadResults };
  });
}

module.exports = {
  getDriveClient,
  createFolder,
  findOrCreateSubfolder,
  deleteFile,
  uploadFile,
  uploadFileWithRetry,
  uploadPhotosBatch,
  prepareApprovalFolder,
  listRootFolders,
  determineNextLetter,
  indexToLetter,
  isLegacyFolder,
  isEnlistmentFolder,
  isReleaseFolder,
  formatDate,
  processApproval,
  DRIVE_SECONDARY_FOLDER_ID,
};
