const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { Readable } = require('stream');

// Load Hebrew font for satori text-to-SVG rendering (reads as ArrayBuffer)
const FONT_DATA = (() => {
  const p = path.join(__dirname, '../assets/fonts/NotoSansHebrew-Regular.ttf');
  if (fs.existsSync(p)) return fs.readFileSync(p);
  const fallback = path.join(__dirname, '../assets/fonts/Rubik-Regular.ttf');
  if (fs.existsSync(fallback)) return fs.readFileSync(fallback);
  return null;
})();

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
 * Upload a Node.js Readable stream to a Drive folder.
 * Used when the source is an R2 object (no local file on disk).
 */
async function uploadStream(stream, filename, folderId) {
  const drive = getDriveClient();
  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: { name: filename, parents: [folderId] },
    media: {
      mimeType: mimeForUpload(filename),
      body: stream,
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
        const displayName = photo.originalName || photo.filename;
        try {
          let driveFileId;
          if (photo.r2Key) {
            // Source is R2 — stream directly to Drive with retry (fresh stream per attempt)
            const { getReadStream } = require('./r2Service');
            let lastErr;
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                const stream = await getReadStream(photo.r2Key);
                driveFileId = await uploadStream(stream, displayName, folderId);
                break;
              } catch (err) {
                lastErr = err;
                console.error(`R2→Drive attempt ${attempt} failed for ${photo.filename}:`, err.message);
                if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
              }
            }
            if (!driveFileId) throw lastErr;
          } else {
            // Source is local disk (legacy flow)
            const localPath = path.join(localDir, photo.filename);
            driveFileId = await uploadFileWithRetry(localPath, displayName, folderId);
          }
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

// ── Summary image generation ──────────────────────────────────────────────
// Uses satori to convert text to SVG paths (no system fonts needed),
// then sharp to convert to JPEG.
function getVehicleTypeMode(vt) {
  if (!vt) return 'default';
  if (vt.includes('באגר גלגלי') || vt.includes('באגר זחל')) return 'bager';
  if (vt.includes('רייזר')) return 'raizer';
  return 'default';
}

async function generateSummaryImage(inspection) {
  const satori = (await import('satori')).default;

  const typeHeb = inspection.type === 'enlistment' ? 'גיוס' : 'שחרור';
  const dateStr = new Date(inspection.createdAt).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  const rows = [];
  rows.push({ label: 'מספר רישוי', value: inspection.licensePlate });
  if (inspection.vehicleType) rows.push({ label: 'סוג כלי', value: inspection.vehicleType });
  rows.push({ label: 'סוג בחינה', value: typeHeb });
  if (inspection.members?.length) rows.push({ label: 'צוות', value: inspection.members.join(', ') });
  if (inspection.location) rows.push({ label: 'מיקום', value: inspection.location });

  const mode = getVehicleTypeMode(inspection.vehicleType);
  if (mode === 'bager') {
    if (inspection.vehicleHoursDigital != null) rows.push({ label: 'שע״מ דיגיטלי', value: String(inspection.vehicleHoursDigital) });
    if (inspection.vehicleHoursAnalog != null) rows.push({ label: 'שע״מ אנלוגי', value: String(inspection.vehicleHoursAnalog) });
  } else if (mode === 'raizer') {
    if (inspection.vehicleHours != null) rows.push({ label: 'שע״מ', value: String(inspection.vehicleHours) });
    if (inspection.kilometers != null) rows.push({ label: 'ק״מ', value: String(inspection.kilometers) });
  } else {
    if (inspection.vehicleHours != null) rows.push({ label: 'שע״מ', value: String(inspection.vehicleHours) });
  }

  if (inspection.securityCode) rows.push({ label: 'קודן', value: inspection.securityCode });
  if (inspection.notes) rows.push({ label: 'הערות', value: String(inspection.notes).slice(0, 120) });
  rows.push({ label: 'תאריך', value: dateStr });
  if (inspection.approvedBy) rows.push({ label: 'טופל ע״י', value: inspection.approvedBy });

  const HEIGHT = 120 + rows.length * 44 + 40;

  // Build the element tree (satori uses React-like plain objects)
  const element = {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'column', width: '800px', height: `${HEIGHT}px`,
        padding: '40px', backgroundColor: 'white', fontFamily: 'Noto Sans Hebrew',
        direction: 'rtl',
      },
      children: [
        // Title
        {
          type: 'div',
          props: {
            style: { fontSize: '28px', fontWeight: 'bold', color: '#1E3A5F', marginBottom: '12px' },
            children: `פרטי בחינה — ${typeHeb} ${inspection.licensePlate}`,
          },
        },
        // Separator
        {
          type: 'div',
          props: { style: { borderBottom: '1px solid #D1D5DB', marginBottom: '16px' } },
        },
        // Data rows
        ...rows.map(({ label, value }) => ({
          type: 'div',
          props: {
            style: { display: 'flex', gap: '12px', marginBottom: '10px', fontSize: '21px' },
            children: [
              { type: 'span', props: { style: { color: '#6B7280', fontWeight: 'bold', flexShrink: 0 }, children: label + ':' } },
              { type: 'span', props: { style: { color: '#111827' }, children: String(value) } },
            ],
          },
        })),
      ],
    },
  };

  const svg = await satori(element, {
    width: 800,
    height: HEIGHT,
    fonts: FONT_DATA ? [{ name: 'Noto Sans Hebrew', data: FONT_DATA, style: 'normal', weight: 400 }] : [],
  });

  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

/**
 * Upload summary image to a Drive folder as a JPEG.
 * Returns the Drive file ID.
 */
async function uploadSummaryImage(inspection, folderId) {
  const buffer = await generateSummaryImage(inspection);
  const drive = getDriveClient();
  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: { name: 'פרטי_בחינה.jpg', parents: [folderId] },
    media: {
      mimeType: 'image/jpeg',
      body: Readable.from(buffer),
    },
    fields: 'id',
  });
  return res.data.id;
}

module.exports = {
  getDriveClient,
  createFolder,
  findOrCreateSubfolder,
  deleteFile,
  uploadFile,
  uploadStream,
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
  uploadSummaryImage,
  DRIVE_SECONDARY_FOLDER_ID,
};
