const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const Inspection = require('../models/Inspection');
const { requireAuth } = require('../middleware/auth');
const { requireTeamCode } = require('../middleware/teamAuth');
const { uploadLimiter } = require('../middleware/rateLimiters');
const { prepareApprovalFolder, uploadPhotosBatch, getDriveClient } = require('../services/driveService');
const router = express.Router();

const UPLOADS_BASE = path.join(__dirname, '../uploads');

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
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
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
// Body (multipart): photos[] + JSON fields in `data` field
router.post('/', requireTeamCode, uploadLimiter, upload.array('photos'), async (req, res) => {
  try {
    let data = {};
    if (req.body.data) {
      data = JSON.parse(req.body.data);
    } else {
      data = req.body;
    }

    // Validate
    const validationErrors = validateInspectionData(data);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors[0] });
    }
    if (!data.type || !['enlistment', 'release'].includes(data.type)) {
      return res.status(400).json({ error: 'סוג בחינה לא תקין' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'נא להוסיף לפחות תמונה או סרטון אחד' });
    }

    // Sanitize
    const licensePlate  = sanitize(data.licensePlate);
    const type          = data.type;
    const location      = sanitize(data.location      || '');
    const notes         = sanitize(data.notes         || '');
    const securityCode  = sanitize(data.securityCode  || '');
    const vehicleHours  = data.vehicleHours != null ? Number(data.vehicleHours) : null;
    const rawMembers    = data.members;
    const members       = (Array.isArray(rawMembers) ? rawMembers : rawMembers ? [rawMembers] : [])
                            .map(sanitize)
                            .filter((m) => m.length > 0 && m.length <= 50);

    const inspection = await Inspection.create({
      licensePlate,
      type,
      members,
      location,
      vehicleHours,
      notes,
      securityCode,
    });

    // Move uploaded files to the inspection's directory
    if (req.files && req.files.length > 0) {
      const movedPhotos = moveFilesToInspectionDir(req.files, inspection._id);
      inspection.photos.push(...movedPhotos);
      await inspection.save();
    }

    res.status(201).json(inspection);
  } catch (err) {
    // Clean up any uploaded tmp files on error
    if (req.files) {
      for (const f of req.files) {
        fs.unlink(f.path, () => {});
      }
    }
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
    res.json(inspection);
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
      // Serve from Drive — works for approved and partially_approved
      const drive = getDriveClient();
      const driveRes = await drive.files.get(
        { fileId: photo.driveFileId, alt: 'media' },
        { responseType: 'stream' }
      );
      res.setHeader('Content-Type', mimeForFilename(photo.filename));
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      driveRes.data.pipe(res);
    } else {
      // Serve from local disk — pending, rejected, or partially_approved (failed files)
      const filePath = path.join(UPLOADS_BASE, inspection._id.toString(), photo.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'קובץ לא נמצא' });
      }
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
    res.json(inspection);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inspections/:id/photos — add more photos (pending or rejected)
router.put('/:id/photos', requireTeamCode, uploadLimiter, upload.array('photos'), async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    if (!['pending', 'rejected'].includes(inspection.status)) {
      return res.status(400).json({ error: 'ניתן לערוך תמונות רק לבחינות במצב ממתין או נדחה' });
    }

    if (req.files && req.files.length > 0) {
      const movedPhotos = moveFilesToInspectionDir(req.files, inspection._id);
      inspection.photos.push(...movedPhotos);
      await inspection.save();
    }

    res.json(inspection);
  } catch (err) {
    if (req.files) {
      for (const f of req.files) fs.unlink(f.path, () => {});
    }
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

    inspection.photos.splice(photoIndex, 1);
    await inspection.save();

    // Delete file from disk
    const filePath = path.join(UPLOADS_BASE, inspection._id.toString(), filename);
    fs.unlink(filePath, () => {});

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inspections/:id/approve — atomic 2-phase approval
//
// Phase 1  Create the Drive folder + upsert Vehicle (inside the approval
//          lock), then immediately persist folderId + status='uploading' to
//          the DB.  From this point a server crash is fully recoverable:
//          the manager clicks Approve again and we resume from Phase 2.
//
// Phase 2  Upload only the photos that don't yet have a driveFileId.
//          After every batch of 3 we save the newly acquired driveFileIds
//          so a mid-upload crash loses at most 3 files' worth of progress.
//
// Phase 3  All driveFileIds present → status='approved', local files
//          deleted.  Any still missing → status='partially_approved'.
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

      // Persist the folder ID and transition to 'uploading' BEFORE we touch
      // any local files.  If the server crashes after this save, the next
      // approve call sees folderId set and skips straight to Phase 2.
      inspection.status       = 'uploading';
      inspection.driveFolderId = folderId;
      inspection.vehicleId    = prep.vehicle._id;
      if (!inspection.approvedAt) inspection.approvedAt = new Date();
      await inspection.save();
    }

    const localDir = path.join(UPLOADS_BASE, inspection._id.toString());

    // ── Phase 2: Upload only the photos that haven't reached Drive yet ──────
    // photos[].driveFileId is the canonical source of truth.
    const photosToUpload = inspection.photos.filter((p) => !p.driveFileId);

    await uploadPhotosBatch(photosToUpload, localDir, folderId, 3, async (batchResults) => {
      // Persist newly uploaded driveFileIds after every batch so a crash
      // loses at most one batch (3 files) of progress.
      let dirty = false;
      for (const r of batchResults) {
        if (r.success) {
          const photo = inspection.photos.find((p) => p.filename === r.filename);
          if (photo && !photo.driveFileId) {
            photo.driveFileId = r.driveFileId;
            dirty = true;
          }
        }
      }
      if (dirty) {
        try {
          await inspection.save();
        } catch (saveErr) {
          // Non-fatal: upload continues. driveFileIds will be saved at end.
          console.error('Progress save failed (non-fatal):', saveErr.message);
        }
      }
    });

    // ── Phase 3: Set final status ────────────────────────────────────────────
    const stillMissing = inspection.photos.filter((p) => !p.driveFileId);

    if (stillMissing.length === 0) {
      inspection.status = 'approved';
      inspection.failedUploads = [];
      await inspection.save();
      deleteInspectionFiles(inspection._id);
    } else {
      inspection.status = 'partially_approved';
      inspection.failedUploads = stillMissing.map((p) => ({
        filename:     p.filename,
        originalName: p.originalName || p.filename,
        error:        'העלאה נכשלה',
      }));
      // Delete successfully uploaded local files; keep the rest on disk
      for (const photo of inspection.photos.filter((p) => p.driveFileId)) {
        fs.unlink(path.join(localDir, photo.filename), () => {});
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
    // If we crashed before any upload succeeded (all driveFileIds still null),
    // revert to 'pending' so the manager sees a clean retry state.
    try {
      if (inspection?.status === 'uploading' && inspection.photos.every((p) => !p.driveFileId)) {
        inspection.status = 'pending';
        await inspection.save();
      }
    } catch { /* ignore revert failure */ }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inspections/:id/retry-uploads — re-upload missing files
// Uses the same driveFileId-based skip logic as the approve endpoint so
// it is safe to call multiple times without creating duplicates.
router.post('/:id/retry-uploads', requireAuth, async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    if (inspection.status !== 'partially_approved') {
      return res.status(400).json({ error: 'ניתן לנסות שוב רק בחינות שאושרו חלקית' });
    }
    if (!inspection.driveFolderId) {
      return res.status(400).json({ error: 'תיקיית Drive לא נמצאה' });
    }

    // Photos without driveFileId are the ones that still need uploading
    const photosToRetry = inspection.photos.filter((p) => !p.driveFileId);
    const localDir = path.join(UPLOADS_BASE, inspection._id.toString());

    await uploadPhotosBatch(photosToRetry, localDir, inspection.driveFolderId, 3, async (batchResults) => {
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

    const stillMissing = inspection.photos.filter((p) => !p.driveFileId);

    if (stillMissing.length === 0) {
      inspection.status = 'approved';
      inspection.failedUploads = [];
      await inspection.save();
      deleteInspectionFiles(inspection._id);
    } else {
      inspection.failedUploads = stillMissing.map((p) => ({
        filename:     p.filename,
        originalName: p.originalName || p.filename,
        error:        'שגיאה לא ידועה',
      }));
      // Delete successfully uploaded local files
      for (const photo of inspection.photos.filter((p) => p.driveFileId)) {
        fs.unlink(path.join(localDir, photo.filename), () => {});
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
    if (!inspection.failedUploads || inspection.failedUploads.length === 0) {
      return res.status(400).json({ error: 'אין קבצים שנכשלו' });
    }

    const zipName = `failed-${inspection.licensePlate}-${inspection._id}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.on('error', (err) => { throw err; });
    archive.pipe(res);

    const inspDir = path.join(UPLOADS_BASE, inspection._id.toString());
    for (const failed of inspection.failedUploads) {
      const photo = inspection.photos.find((p) => p.filename === failed.filename);
      const archiveName = photo?.originalName || failed.filename;
      const filePath = path.join(inspDir, failed.filename);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: archiveName });
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
    await inspection.save();

    // Local files are intentionally kept — team members need to see photos
    // and may resubmit after correction. Files are only removed on approval
    // (after Drive upload) or on explicit manager delete.

    res.json({ success: true, inspection });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inspections/:id/download-zip — download all photos as ZIP
router.get('/:id/download-zip', async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    if (inspection.photos.length === 0) {
      return res.status(400).json({ error: 'אין תמונות להורדה' });
    }

    const zipName = `inspection-${inspection.licensePlate}-${inspection._id}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.on('error', (err) => { throw err; });
    archive.pipe(res);

    // Use driveFileId per photo as source of truth — works for approved,
    // partially_approved, pending, and rejected in one pass.
    const drive = getDriveClient();
    const inspDir = path.join(UPLOADS_BASE, inspection._id.toString());

    for (const photo of inspection.photos) {
      if (photo.driveFileId) {
        const streamRes = await drive.files.get(
          { fileId: photo.driveFileId, alt: 'media' },
          { responseType: 'stream' }
        );
        archive.append(streamRes.data, { name: photo.originalName || photo.filename });
      } else {
        const filePath = path.join(inspDir, photo.filename);
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: photo.originalName || photo.filename });
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

    // Clean up local files if they exist
    deleteInspectionFiles(inspection._id);

    inspection.status = 'deleted';
    await inspection.save();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Multer error handler ───────────────────────────────────────────────────
// Must be a 4-argument Express error middleware to catch multer errors before
// they reach the default HTML error handler.
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
