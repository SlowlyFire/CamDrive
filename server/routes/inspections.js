const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const Inspection = require('../models/Inspection');
const { requireAuth } = require('../middleware/auth');
const { requireTeamCode } = require('../middleware/teamAuth');
const { uploadLimiter } = require('../middleware/rateLimiters');
const {
  prepareApprovalFolder,
  uploadPhotosBatch,
  uploadSummaryImage,
  getDriveClient,
  createFolder,
  findOrCreateSubfolder,
  formatDate,
} = require('../services/driveService');
const router = express.Router();

const { getPresignedGetUrl } = require('../services/r2Service');
const UPLOADS_BASE = path.join(__dirname, '../uploads');

// ── Pre-generate presigned URLs for all R2-backed files ──────────────────
// Attaches `signedUrl` to each photo/document so the client can load
// directly from R2 instead of following per-image 302 redirects.
async function attachSignedUrls(obj) {
  const TWO_HOURS = 7200;
  const sign = async (item) => {
    if (item.r2Key && !item.driveFileId) {
      try { item.signedUrl = await getPresignedGetUrl(item.r2Key, TWO_HOURS); } catch {}
    }
  };
  await Promise.all([
    ...(obj.photos || []).map(sign),
    ...(obj.documents || []).map(sign),
  ]);
}

// ── MIME type lookup for serving files ────────────────────────────────────
const MIME_BY_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
};

function mimeForFilename(filename) {
  const ext = path.extname(filename).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

// ── Multer config ──────────────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png',
  'image/heic', 'image/heif', 'image/webp',
  'video/mp4', 'video/quicktime',   // .mov
  'video/x-msvideo',                // .avi
  'video/x-matroska',               // .mkv
]);

const MAX_FILES = 200;
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tmpDir = path.join(UPLOADS_BASE, '_tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage: tempStorage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES + 50 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error('סוג קובץ לא נתמך — יש להעלות תמונה (jpeg, png, heic, webp) או סרטון (mp4, mov, avi, mkv)'));
  },
});

// ── Input validation ───────────────────────────────────────────────────────
// Hebrew Unicode range: \u0590-\u05FF
const PLATE_RE = /^[\w\u0590-\u05FF\s-]+$/;

function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').replace(/\0/g, '').trim();
}

function validateInspectionData(data) {
  const errors = [];
  const plate = sanitize(data.licensePlate || '');
  if (!plate) {
    errors.push('מספר רישוי הוא שדה חובה');
  } else if (plate.length > 40) {
    errors.push('מספר רישוי ארוך מדי (מקסימום 40 תווים)');
  } else if (!PLATE_RE.test(plate)) {
    errors.push('מספר רישוי מכיל תווים לא חוקיים');
  }
  if (data.notes        && sanitize(data.notes).length        > 2000) errors.push('הערות ארוכות מדי (מקסימום 2000 תווים)');
  if (data.location     && sanitize(data.location).length     > 200)  errors.push('מיקום ארוך מדי (מקסימום 200 תווים)');
  if (data.securityCode && sanitize(data.securityCode).length > 50)   errors.push('קוד מיגון ארוך מדי (מקסימום 50 תווים)');
  if (data.vehicleHours != null) {
    const h = Number(data.vehicleHours);
    if (isNaN(h) || h < 0 || h > 200000) errors.push('שע״מ חייב להיות מספר בין 0 ל-200000');
  }
  return errors;
}

// Helper: move files from _tmp to uploads/{inspectionId}/
function moveFilesToInspectionDir(files, inspectionId) {
  const dest = path.join(UPLOADS_BASE, inspectionId.toString());
  fs.mkdirSync(dest, { recursive: true });
  const moved = [];
  for (const file of files) {
    const newPath = path.join(dest, file.filename);
    fs.renameSync(file.path, newPath);
    moved.push({
      filename: file.filename,
      originalName: file.originalname,
    });
  }
  return moved;
}

// Helper: delete all local files for an inspection
function deleteInspectionFiles(inspectionId) {
  const dir = path.join(UPLOADS_BASE, inspectionId.toString());
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────

// POST /api/inspections — create new inspection
// Body (JSON): form fields + photos:[{r2Key,originalName}] + documents:[{r2Key,originalName}]
// Files are pre-uploaded directly to R2 by the client via presigned URLs.
router.post('/', requireTeamCode, uploadLimiter, async (req, res) => {
  try {
    const data = req.body;

    // Validate
    const validationErrors = validateInspectionData(data);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors[0] });
    }
    if (!data.type || !['enlistment', 'release'].includes(data.type)) {
      return res.status(400).json({ error: 'סוג בחינה לא תקין' });
    }

    const r2Photos    = Array.isArray(data.photos)    ? data.photos    : [];
    const r2Documents = Array.isArray(data.documents) ? data.documents : [];

    if (r2Photos.length === 0) {
      return res.status(400).json({ error: 'נא להוסיף לפחות תמונה או סרטון אחד' });
    }

    // Sanitize
    const licensePlate = sanitize(data.licensePlate);
    const type         = data.type;
    const vehicleType  = sanitize(data.vehicleType  || '');
    const location     = sanitize(data.location     || '');
    const notes        = sanitize(data.notes        || '');
    const securityCode = sanitize(data.securityCode || '');
    const vehicleHours        = data.vehicleHours != null && data.vehicleHours !== '' ? Number(data.vehicleHours) : null;
    const vehicleHoursDigital = data.vehicleHoursDigital != null && data.vehicleHoursDigital !== '' ? Number(data.vehicleHoursDigital) : null;
    const vehicleHoursAnalog  = data.vehicleHoursAnalog != null && data.vehicleHoursAnalog !== '' ? Number(data.vehicleHoursAnalog) : null;
    const kilometers          = data.kilometers != null && data.kilometers !== '' ? Number(data.kilometers) : null;
    const rawMembers   = data.members;
    const members      = (Array.isArray(rawMembers) ? rawMembers : rawMembers ? [rawMembers] : [])
                           .map(sanitize)
                           .filter((m) => m.length > 0 && m.length <= 50);

    const inspection = await Inspection.create({
      licensePlate, type, vehicleType, members,
      location, vehicleHours, vehicleHoursDigital, vehicleHoursAnalog, kilometers,
      notes, securityCode,
    });

    // Register R2-uploaded photos
    for (const p of r2Photos) {
      if (!p.r2Key) continue;
      const filename = path.basename(p.r2Key);
      inspection.photos.push({ filename, originalName: p.originalName || filename, r2Key: p.r2Key });
    }

    // Register R2-uploaded documents
    for (const d of r2Documents) {
      if (!d.r2Key) continue;
      const filename = path.basename(d.r2Key);
      inspection.documents.push({ filename, originalName: d.originalName || filename, r2Key: d.r2Key });
    }

    if (r2Photos.length > 0 || r2Documents.length > 0) await inspection.save();

    res.status(201).json(inspection);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inspections/pending — pending + partially_approved (manager)
router.get('/pending', requireAuth, async (req, res) => {
  try {
    const inspections = await Inspection.find({
      status: { $in: ['pending', 'uploading', 'partially_approved'] },
    }).sort({ createdAt: -1 });
    res.json(inspections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inspections/my/:personName — pending + rejected inspections for a person
router.get('/my/:personName', requireTeamCode, async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.personName);
    const inspections = await Inspection.find({
      members: name,
      status: { $in: ['pending', 'rejected'] },
    }).sort({ createdAt: -1 });
    res.json(inspections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inspections/share/:shareToken — public read-only view
router.get('/share/:shareToken', async (req, res) => {
  try {
    const inspection = await Inspection.findOne({ shareToken: req.params.shareToken });
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    const obj = inspection.toObject();
    await attachSignedUrls(obj);
    res.json(obj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inspections/today — inspections processed today (manager)
// MUST be before /:id to avoid "today" matching as an ID
router.get('/today', requireAuth, async (req, res) => {
  try {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const inspections = await Inspection.find({
      processedAt: { $gte: start, $lte: end },
      status: { $in: ['approved', 'partially_approved', 'reserve', 'temporarily_disqualified', 'disqualified'] },
    }).sort({ processedAt: -1 }).select('-photos -documents -failedUploads');
    res.json(inspections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inspections/:id/photos/:filename — serve a photo
// For pending/rejected: stream from local disk.
// For approved: proxy from Google Drive using the stored driveFileId.
router.get('/:id/photos/:filename', async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });

    const photo = inspection.photos.find((p) => p.filename === req.params.filename);
    if (!photo) return res.status(404).json({ error: 'תמונה לא נמצאה' });

    if (photo.driveFileId) {
      // Serve from Drive — approved / partially_approved
      const drive = getDriveClient();
      const driveRes = await drive.files.get(
        { fileId: photo.driveFileId, alt: 'media' },
        { responseType: 'stream' }
      );
      res.setHeader('Content-Type', mimeForFilename(photo.filename));
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      driveRes.data.pipe(res);
    } else if (photo.r2Key) {
      // Redirect to R2 presigned URL (HEIC files should have been migrated to JPG)
      const url = await getPresignedGetUrl(photo.r2Key, 7200);
      return res.redirect(302, url);
    } else {
      // Legacy: local disk fallback (files uploaded before R2 migration)
      const filePath = path.join(UPLOADS_BASE, inspection._id.toString(), photo.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'קובץ לא נמצא' });
      }
      res.setHeader('Content-Type', mimeForFilename(photo.filename));
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(filePath);
    }
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// GET /api/inspections/:id/documents/:filename — serve a document
router.get('/:id/documents/:filename', async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    const doc = inspection.documents.find((d) => d.filename === req.params.filename);
    if (!doc) return res.status(404).json({ error: 'מסמך לא נמצא' });
    if (doc.driveFileId) {
      const drive = getDriveClient();
      const driveRes = await drive.files.get({ fileId: doc.driveFileId, alt: 'media' }, { responseType: 'stream' });
      res.setHeader('Content-Type', mimeForFilename(doc.filename));
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      driveRes.data.pipe(res);
    } else if (doc.r2Key) {
      const url = await getPresignedGetUrl(doc.r2Key, 7200);
      return res.redirect(302, url);
    } else {
      const filePath = path.join(UPLOADS_BASE, inspection._id.toString(), doc.filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'קובץ לא נמצא' });
      res.setHeader('Content-Type', mimeForFilename(doc.filename));
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(filePath);
    }
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// GET /api/inspections/:id — single inspection detail
router.get('/:id', async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });

    // Auto-finalize: if partially_approved but every file already has a driveFileId,
    // clear failedUploads and promote to approved so the card and detail are consistent.
    if (inspection.status === 'partially_approved') {
      const allDone =
        inspection.photos.every((p) => p.driveFileId) &&
        (inspection.documents || []).every((d) => d.driveFileId);
      if (allDone) {
        inspection.status = 'approved';
        inspection.failedUploads = [];
        await inspection.save();
      }
    }

    const obj = inspection.toObject();
    await attachSignedUrls(obj);
    res.json(obj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inspections/:id/photos — add more photos (pending or rejected)
// Receives files via multipart; uploads each to R2; saves r2Key in MongoDB.
router.put('/:id/photos', requireTeamCode, uploadLimiter, upload.array('photos'), async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    if (!['pending', 'rejected'].includes(inspection.status)) {
      return res.status(400).json({ error: 'ניתן לערוך תמונות רק לבחינות במצב ממתין או נדחה' });
    }

    if (req.files && req.files.length > 0) {
      const { uploadLocalFile } = require('../services/r2Service');
      for (const file of req.files) {
        const ext = path.extname(file.originalname) || path.extname(file.filename);
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const r2Key = `pending/${unique}${ext}`;
        try {
          await uploadLocalFile(r2Key, file.path, file.mimetype);
          inspection.photos.push({
            filename: path.basename(r2Key),
            originalName: file.originalname,
            r2Key,
          });
        } finally {
          fs.unlink(file.path, () => {});
        }
      }
      await inspection.save();
    }

    res.json(inspection);
  } catch (err) {
    if (req.files) for (const f of req.files) fs.unlink(f.path, () => {});
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inspections/:id/photos/:photoFilename — delete one photo (pending or rejected)
router.delete('/:id/photos/:photoFilename', requireTeamCode, async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    if (!['pending', 'rejected'].includes(inspection.status)) {
      return res.status(400).json({ error: 'ניתן לערוך תמונות רק לבחינות במצב ממתין או נדחה' });
    }

    const filename = req.params.photoFilename;
    const photoIndex = inspection.photos.findIndex((p) => p.filename === filename);
    if (photoIndex === -1) return res.status(404).json({ error: 'תמונה לא נמצאה' });

    const photo = inspection.photos[photoIndex];
    inspection.photos.splice(photoIndex, 1);
    await inspection.save();

    // Delete from R2 or local disk
    if (photo.r2Key) {
      const { deleteObject } = require('../services/r2Service');
      await deleteObject(photo.r2Key);
    } else {
      const filePath = path.join(UPLOADS_BASE, inspection._id.toString(), filename);
      fs.unlink(filePath, () => {});
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inspections/:id/documents — add documents (pending or rejected)
router.put('/:id/documents', requireTeamCode, uploadLimiter, upload.array('documents', 50), async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    if (!['pending', 'rejected'].includes(inspection.status)) {
      return res.status(400).json({ error: 'ניתן לערוך מסמכים רק לבחינות במצב ממתין או נדחה' });
    }

    if (req.files && req.files.length > 0) {
      const { uploadLocalFile } = require('../services/r2Service');
      for (const file of req.files) {
        const ext = path.extname(file.originalname) || path.extname(file.filename);
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const r2Key = `pending/${unique}${ext}`;
        try {
          await uploadLocalFile(r2Key, file.path, file.mimetype);
          inspection.documents.push({
            filename: path.basename(r2Key),
            originalName: file.originalname,
            r2Key,
          });
        } finally {
          fs.unlink(file.path, () => {});
        }
      }
      await inspection.save();
    }

    res.json(inspection);
  } catch (err) {
    if (req.files) for (const f of req.files) fs.unlink(f.path, () => {});
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inspections/:id/documents/:docFilename — delete one document (pending or rejected)
router.delete('/:id/documents/:docFilename', requireTeamCode, async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    if (!['pending', 'rejected'].includes(inspection.status)) {
      return res.status(400).json({ error: 'ניתן לערוך מסמכים רק לבחינות במצב ממתין או נדחה' });
    }

    const filename = req.params.docFilename;
    const docIndex = inspection.documents.findIndex((d) => d.filename === filename);
    if (docIndex === -1) return res.status(404).json({ error: 'מסמך לא נמצא' });

    const doc = inspection.documents[docIndex];
    inspection.documents.splice(docIndex, 1);
    await inspection.save();

    if (doc.r2Key) {
      const { deleteObject } = require('../services/r2Service');
      await deleteObject(doc.r2Key);
    } else {
      const filePath = path.join(UPLOADS_BASE, inspection._id.toString(), filename);
      fs.unlink(filePath, () => {});
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inspections/:id/text — edit text fields (pending or rejected)
router.put('/:id/text', requireTeamCode, async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    if (!['pending', 'rejected'].includes(inspection.status)) {
      return res.status(400).json({ error: 'ניתן לערוך רק בחינות ממתינות או שנדחו' });
    }

    const { type, notes, location, vehicleHours, vehicleHoursDigital, vehicleHoursAnalog, kilometers, securityCode, vehicleType } = req.body;

    if (type !== undefined && ['enlistment', 'release'].includes(type)) inspection.type = type;
    if (vehicleType !== undefined) inspection.vehicleType = sanitize(String(vehicleType || '')).slice(0, 100);
    if (location !== undefined) inspection.location = sanitize(String(location || '')).slice(0, 200);
    if (notes !== undefined) inspection.notes = sanitize(String(notes || '')).slice(0, 2000);
    if (securityCode !== undefined) inspection.securityCode = sanitize(String(securityCode || '')).slice(0, 50);
    const parseNum = (v) => { const n = v === '' || v == null ? null : Number(v); return (!isNaN(n) && n >= 0) ? n : null; };
    if (vehicleHours !== undefined) inspection.vehicleHours = parseNum(vehicleHours);
    if (vehicleHoursDigital !== undefined) inspection.vehicleHoursDigital = parseNum(vehicleHoursDigital);
    if (vehicleHoursAnalog !== undefined) inspection.vehicleHoursAnalog = parseNum(vehicleHoursAnalog);
    if (kilometers !== undefined) inspection.kilometers = parseNum(kilometers);

    await inspection.save();
    res.json(inspection);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inspections/:id/approve — atomic 3-phase approval
//
// Phase 1  Create the Drive folder + subfolders + upsert Vehicle (inside the
//          approval lock), then immediately persist folderId + status='uploading'
//          to the DB. From this point a server crash is fully recoverable.
//
// Phase 2a Upload documents to driveDocsFolderId
// Phase 2b Upload photos to drivePhotosFolderId (falls back to parent folder)
//
// Phase 3  All driveFileIds present → status='approved', processedAt set,
//          local files deleted. Any still missing → status='partially_approved'.
//
// Idempotent: safe to call again after any kind of failure.
router.post('/:id/approve', requireAuth, async (req, res) => {
  let inspection;
  try {
    inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });

    // Allow both fresh approvals and resuming a crashed/interrupted upload
    if (!['pending', 'uploading'].includes(inspection.status)) {
      return res.status(400).json({ error: 'ניתן לאשר רק בחינות במצב ממתין' });
    }

    let folderId = inspection.driveFolderId;
    let folderName = null;
    let letter = null;

    // ── Phase 1: Create Drive folder (skip if we already have one) ──────────
    if (!folderId) {
      const prep = await prepareApprovalFolder(inspection);
      folderId    = prep.folderId;
      folderName  = prep.folderName;
      letter      = prep.letter;

      inspection.status            = 'uploading';
      inspection.driveFolderId     = folderId;
      inspection.driveDocsFolderId  = prep.docsFolderId;
      inspection.drivePhotosFolderId = prep.photosFolderId;
      inspection.vehicleId         = prep.vehicle._id;
      if (!inspection.approvedAt) inspection.approvedAt = new Date();
      await inspection.save();
    } else {
      // Resume: use main folder directly (flat structure — no subfolders)
      let dirty = false;
      if (!inspection.driveDocsFolderId) {
        inspection.driveDocsFolderId = folderId;
        dirty = true;
      }
      if (!inspection.drivePhotosFolderId) {
        inspection.drivePhotosFolderId = folderId;
        dirty = true;
      }
      if (dirty) await inspection.save();
    }

    const localDir = path.join(UPLOADS_BASE, inspection._id.toString());

    // ── Phase 2a: Upload documents ──────────────────────────────────────────
    const docsToUpload = (inspection.documents || []).filter((d) => !d.driveFileId);
    if (docsToUpload.length > 0 && inspection.driveDocsFolderId) {
      await uploadPhotosBatch(docsToUpload, localDir, inspection.driveDocsFolderId, 3, async (batchResults) => {
        let dirty = false;
        for (const r of batchResults) {
          if (r.success) {
            const doc = inspection.documents.find((d) => d.filename === r.filename);
            if (doc && !doc.driveFileId) {
              doc.driveFileId = r.driveFileId;
              if (doc.r2Key) {
                const { deleteObject } = require('../services/r2Service');
                await deleteObject(doc.r2Key).catch(() => {});
                doc.r2Key = null;
              }
              dirty = true;
            }
          }
        }
        if (dirty) {
          try { await inspection.save(); } catch (saveErr) {
            console.error('Progress save failed (non-fatal):', saveErr.message);
          }
        }
      });
    }

    // ── Phase 2b: Upload photos ──────────────────────────────────────────────
    const photosToUpload = inspection.photos.filter((p) => !p.driveFileId);
    const photoTargetFolder = inspection.drivePhotosFolderId || folderId;

    await uploadPhotosBatch(photosToUpload, localDir, photoTargetFolder, 3, async (batchResults) => {
      let dirty = false;
      for (const r of batchResults) {
        if (r.success) {
          const photo = inspection.photos.find((p) => p.filename === r.filename);
          if (photo && !photo.driveFileId) {
            photo.driveFileId = r.driveFileId;
            if (photo.r2Key) {
              const { deleteObject } = require('../services/r2Service');
              await deleteObject(photo.r2Key).catch(() => {});
              photo.r2Key = null;
            }
            dirty = true;
          }
        }
      }
      if (dirty) {
        try { await inspection.save(); } catch (saveErr) {
          console.error('Progress save failed (non-fatal):', saveErr.message);
        }
      }
    });

    // ── Phase 3: Set final status ────────────────────────────────────────────
    const stillMissingPhotos = inspection.photos.filter((p) => !p.driveFileId);
    const stillMissingDocs   = (inspection.documents || []).filter((d) => !d.driveFileId);

    if (stillMissingPhotos.length === 0 && stillMissingDocs.length === 0) {
      inspection.status = 'approved';
      inspection.processedAt = new Date();
      inspection.failedUploads = [];
      inspection.approvedBy = req.manager?.managerName || req.body?.managerName || null;
      await inspection.save();
      // Upload summary image to Drive (fire-and-forget — don't block approval)
      uploadSummaryImage(inspection, folderId).catch((e) => console.error('[summary-image] Upload failed:', e.stack || e));
      deleteInspectionFiles(inspection._id);
    } else {
      inspection.status = 'partially_approved';
      inspection.processedAt = new Date();
      inspection.approvedBy = req.manager?.managerName || req.body?.managerName || null;
      inspection.failedUploads = [
        ...stillMissingPhotos.map((p) => ({
          filename:     p.filename,
          originalName: p.originalName || p.filename,
          error:        'העלאה נכשלה',
        })),
        ...stillMissingDocs.map((d) => ({
          filename:     d.filename,
          originalName: d.originalName || d.filename,
          error:        'העלאה נכשלה',
        })),
      ];
      // Delete successfully uploaded local files; keep the rest on disk
      for (const photo of inspection.photos.filter((p) => p.driveFileId)) {
        fs.unlink(path.join(localDir, photo.filename), () => {});
      }
      for (const doc of (inspection.documents || []).filter((d) => d.driveFileId)) {
        fs.unlink(path.join(localDir, doc.filename), () => {});
      }
      await inspection.save();
    }

    res.json({
      success: true,
      inspection,
      driveFolderName: folderName,
      driveFolderId:   folderId,
      letter,
    });
  } catch (err) {
    console.error('Approval error:', err);
    try {
      if (inspection?.status === 'uploading' &&
          inspection.photos.every((p) => !p.driveFileId) &&
          (inspection.documents || []).every((d) => !d.driveFileId)) {
        inspection.status = 'pending';
        await inspection.save();
      }
    } catch { /* ignore revert failure */ }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inspections/:id/retry-uploads — re-upload missing files
router.post('/:id/retry-uploads', requireAuth, async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    if (!['partially_approved', 'uploading'].includes(inspection.status)) {
      return res.status(400).json({ error: 'ניתן לנסות שוב רק בחינות שאושרו חלקית או שהעלאתן הופסקה' });
    }
    if (!inspection.driveFolderId) {
      return res.status(400).json({ error: 'תיקיית Drive לא נמצאה' });
    }

    const localDir = path.join(UPLOADS_BASE, inspection._id.toString());

    // Retry documents
    const docsToRetry = (inspection.documents || []).filter((d) => !d.driveFileId);
    if (docsToRetry.length > 0) {
      const docsFolderId = inspection.driveDocsFolderId ||
        (await createFolder('מסמכים', inspection.driveFolderId)).id;
      if (!inspection.driveDocsFolderId) {
        inspection.driveDocsFolderId = docsFolderId;
        await inspection.save();
      }
      await uploadPhotosBatch(docsToRetry, localDir, docsFolderId, 3, async (batchResults) => {
        let dirty = false;
        for (const r of batchResults) {
          if (r.success) {
            const doc = inspection.documents.find((d) => d.filename === r.filename);
            if (doc && !doc.driveFileId) { doc.driveFileId = r.driveFileId; dirty = true; }
          }
        }
        if (dirty) {
          try { await inspection.save(); } catch (e) { console.error('Progress save failed (non-fatal):', e.message); }
        }
      });
    }

    // Retry photos
    const photosToRetry = inspection.photos.filter((p) => !p.driveFileId);
    const photoTargetFolder = inspection.drivePhotosFolderId || inspection.driveFolderId;
    await uploadPhotosBatch(photosToRetry, localDir, photoTargetFolder, 3, async (batchResults) => {
      let dirty = false;
      for (const r of batchResults) {
        if (r.success) {
          const photo = inspection.photos.find((p) => p.filename === r.filename);
          if (photo && !photo.driveFileId) { photo.driveFileId = r.driveFileId; dirty = true; }
        }
      }
      if (dirty) {
        try { await inspection.save(); } catch (e) { console.error('Progress save failed (non-fatal):', e.message); }
      }
    });

    const stillMissingPhotos = inspection.photos.filter((p) => !p.driveFileId);
    const stillMissingDocs   = (inspection.documents || []).filter((d) => !d.driveFileId);

    if (stillMissingPhotos.length === 0 && stillMissingDocs.length === 0) {
      inspection.status = 'approved';
      inspection.processedAt = new Date();
      inspection.failedUploads = [];
      await inspection.save();
      deleteInspectionFiles(inspection._id);
    } else {
      inspection.failedUploads = [
        ...stillMissingPhotos.map((p) => ({
          filename:     p.filename,
          originalName: p.originalName || p.filename,
          error:        'שגיאה לא ידועה',
        })),
        ...stillMissingDocs.map((d) => ({
          filename:     d.filename,
          originalName: d.originalName || d.filename,
          error:        'שגיאה לא ידועה',
        })),
      ];
      for (const photo of inspection.photos.filter((p) => p.driveFileId)) {
        fs.unlink(path.join(localDir, photo.filename), () => {});
      }
      for (const doc of (inspection.documents || []).filter((d) => d.driveFileId)) {
        fs.unlink(path.join(localDir, doc.filename), () => {});
      }
      await inspection.save();
    }

    res.json({ success: true, inspection });
  } catch (err) {
    console.error('Retry upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inspections/:id/download-failed-zip — ZIP of only the failed files
router.get('/:id/download-failed-zip', requireAuth, async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });

    const failedPhotos = inspection.photos.filter((p) => !p.driveFileId);
    const failedDocs   = (inspection.documents || []).filter((d) => !d.driveFileId);

    if (failedPhotos.length === 0 && failedDocs.length === 0) {
      return res.status(400).json({ error: 'אין קבצים שנכשלו' });
    }

    const zipName = `failed-${inspection.licensePlate}-${inspection._id}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.on('error', (err) => { throw err; });
    archive.pipe(res);

    const inspDir = path.join(UPLOADS_BASE, inspection._id.toString());
    for (const photo of failedPhotos) {
      const archiveName = photo.originalName || photo.filename;
      const filePath = path.join(inspDir, photo.filename);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: `תמונות/${archiveName}` });
      }
    }
    for (const doc of failedDocs) {
      const archiveName = doc.originalName || doc.filename;
      const filePath = path.join(inspDir, doc.filename);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: `מסמכים/${archiveName}` });
      }
    }

    await archive.finalize();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// POST /api/inspections/:id/reject — manager rejects
router.post('/:id/reject', requireAuth, async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    if (inspection.status !== 'pending') {
      return res.status(400).json({ error: 'ניתן לדחות רק בחינות במצב ממתין' });
    }

    const reason = sanitize(req.body.reason || '').slice(0, 500);
    inspection.status = 'rejected';
    inspection.rejectedAt = new Date();
    inspection.rejectionReason = reason;
    inspection.rejectedBy = req.manager?.managerName || req.body?.managerName || null;
    await inspection.save();

    res.json({ success: true, inspection });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inspections/:id/download-zip — download all photos and documents as ZIP
router.get('/:id/download-zip', async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    if (inspection.photos.length === 0 && (inspection.documents || []).length === 0) {
      return res.status(400).json({ error: 'אין קבצים להורדה' });
    }

    const zipName = `inspection-${inspection.licensePlate}-${inspection._id}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.on('error', (err) => { throw err; });
    archive.pipe(res);

    const drive = getDriveClient();
    const inspDir = path.join(UPLOADS_BASE, inspection._id.toString());

    // All files flat in the ZIP (no subfolders)
    for (const photo of inspection.photos) {
      const archiveName = photo.originalName || photo.filename;
      if (photo.driveFileId) {
        const streamRes = await drive.files.get(
          { fileId: photo.driveFileId, alt: 'media' },
          { responseType: 'stream' }
        );
        archive.append(streamRes.data, { name: archiveName });
      } else {
        const filePath = path.join(inspDir, photo.filename);
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: archiveName });
        }
      }
    }

    for (const doc of (inspection.documents || [])) {
      const archiveName = doc.originalName || doc.filename;
      if (doc.driveFileId) {
        const streamRes = await drive.files.get(
          { fileId: doc.driveFileId, alt: 'media' },
          { responseType: 'stream' }
        );
        archive.append(streamRes.data, { name: archiveName });
      } else {
        const filePath = path.join(inspDir, doc.filename);
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: archiveName });
        }
      }
    }

    await archive.finalize();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// POST /api/inspections/:id/classify — classify inspection as reserve/disqualified
router.post('/:id/classify', requireAuth, async (req, res) => {
  const { classification } = req.body;
  const VALID = ['reserve', 'temporarily_disqualified', 'disqualified'];
  if (!VALID.includes(classification)) return res.status(400).json({ error: 'סיווג לא תקין' });

  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    if (!['pending', 'uploading'].includes(inspection.status)) {
      return res.status(400).json({ error: 'ניתן לסווג רק בחינות ממתינות' });
    }

    const SECONDARY_FOLDER_ID = process.env.DRIVE_SECONDARY_FOLDER_ID;
    if (!SECONDARY_FOLDER_ID) return res.status(500).json({ error: 'תיקיית Drive משנית לא מוגדרת' });

    const CLASS_HEBREW = { reserve: 'רזרבה', temporarily_disqualified: 'נפסל זמנית', disqualified: 'נפסל' };
    const classHebrew = CLASS_HEBREW[classification];
    const vehicleType = inspection.vehicleType || 'לא ידוע';
    const dateStr = formatDate(new Date());
    const folderName = `בחינה לגיוס ${inspection.licensePlate} ${dateStr}`;

    // Create folder hierarchy in secondary Drive: secondary/classification/vehicleType/folder
    const classFolderId = await findOrCreateSubfolder(classHebrew, SECONDARY_FOLDER_ID);
    const typeFolderId = await findOrCreateSubfolder(vehicleType, classFolderId);
    const { id: folderId } = await createFolder(folderName, typeFolderId);

    const localDir = path.join(UPLOADS_BASE, inspection._id.toString());

    // Upload all files (documents + photos) directly into the inspection folder (flat structure)
    let docResults = [];
    if (inspection.documents && inspection.documents.length > 0) {
      docResults = await uploadPhotosBatch(inspection.documents, localDir, folderId);
    }

    let photoResults = [];
    if (inspection.photos && inspection.photos.length > 0) {
      photoResults = await uploadPhotosBatch(inspection.photos, localDir, folderId);
    }

    // Apply driveFileIds
    for (const r of docResults) {
      if (r.success) {
        const doc = inspection.documents.find((d) => d.filename === r.filename);
        if (doc) doc.driveFileId = r.driveFileId;
      }
    }
    for (const r of photoResults) {
      if (r.success) {
        const photo = inspection.photos.find((p) => p.filename === r.filename);
        if (photo) photo.driveFileId = r.driveFileId;
      }
    }

    // Update Vehicle record
    const Vehicle = require('../models/Vehicle');
    let vehicle = await Vehicle.findOne({ licensePlate: inspection.licensePlate });
    if (!vehicle) vehicle = new Vehicle({ licensePlate: inspection.licensePlate });
    vehicle.driveFolders.push({ folderId, folderName, type: classification, createdAt: new Date() });
    await vehicle.save();

    // Finalize inspection
    inspection.status = classification;
    inspection.classification = classification;
    inspection.classifiedAt = new Date();
    inspection.processedAt = new Date();
    inspection.driveFolderId = folderId;
    inspection.approvedBy = req.manager?.managerName || req.body?.managerName || null;
    await inspection.save();

    uploadSummaryImage(inspection, folderId).catch((e) => console.error('[summary-image] Upload failed:', e.stack || e));
    deleteInspectionFiles(inspection._id);

    res.json({ success: true, inspection, driveFolderName: folderName });
  } catch (err) {
    console.error('Classify error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inspections/:id/resubmit — team resubmits a rejected inspection
router.put('/:id/resubmit', requireTeamCode, async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    if (inspection.status !== 'rejected') {
      return res.status(400).json({ error: 'ניתן לשלוח מחדש רק בחינות שנדחו' });
    }

    inspection.status = 'pending';
    inspection.rejectionReason = '';
    inspection.rejectedAt = null;
    await inspection.save();

    res.json({ success: true, inspection });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inspections/:id/delete — manager soft-deletes an inspection
router.post('/:id/delete', requireAuth, async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    if (inspection.status === 'deleted') {
      return res.status(400).json({ error: 'הבחינה כבר נמחקה' });
    }

    // Clean up local files (legacy) and R2 files
    deleteInspectionFiles(inspection._id);

    const r2Keys = [
      ...inspection.photos.filter((p) => p.r2Key).map((p) => p.r2Key),
      ...(inspection.documents || []).filter((d) => d.r2Key).map((d) => d.r2Key),
    ];
    if (r2Keys.length > 0) {
      const { deleteObjects } = require('../services/r2Service');
      await deleteObjects(r2Keys).catch(() => {});
    }

    inspection.status = 'deleted';
    await inspection.save();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Multer error handler ───────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'הקובץ גדול מדי — מקסימום 500MB לקובץ' });
  }
  if (err && err.code === 'LIMIT_FILE_COUNT') {
    return res.status(413).json({ error: `יותר מדי קבצים — מקסימום ${MAX_FILES} קבצים` });
  }
  if (err && err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
