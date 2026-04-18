const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const Inspection = require('../models/Inspection');
const { requireAuth } = require('../middleware/auth');
const { requireTeamCode } = require('../middleware/teamAuth');
const { uploadLimiter } = require('../middleware/rateLimiters');
const { processApproval, getDriveClient } = require('../services/driveService');
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
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

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
      status: { $in: ['pending', 'partially_approved'] },
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

// POST /api/inspections/:id/approve — manager approves → Drive upload
router.post('/:id/approve', requireAuth, async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    if (inspection.status !== 'pending') {
      return res.status(400).json({ error: 'ניתן לאשר רק בחינות במצב ממתין' });
    }

    // Run Drive upload logic
    const { vehicle, folderName, folderId, letter, uploadResults } = await processApproval(
      inspection,
      UPLOADS_BASE
    );

    const failedUploads = uploadResults.filter((r) => !r.success);
    if (failedUploads.length > 0) {
      console.error('Failed photo uploads:', failedUploads);
    }

    // Save Drive file IDs back onto each successfully uploaded photo
    for (const result of uploadResults) {
      if (result.success) {
        const photo = inspection.photos.find((p) => p.filename === result.filename);
        if (photo) photo.driveFileId = result.driveFileId;
      }
    }

    // Delete only the successfully uploaded local files
    for (const result of uploadResults.filter((r) => r.success)) {
      const localPath = path.join(UPLOADS_BASE, inspection._id.toString(), result.filename);
      fs.unlink(localPath, () => {});
    }

    inspection.vehicleId = vehicle._id;
    inspection.driveFolderId = folderId;
    inspection.approvedAt = new Date();

    if (failedUploads.length === 0) {
      // All uploaded — fully approved
      inspection.status = 'approved';
      inspection.failedUploads = [];
      deleteInspectionFiles(inspection._id); // clean up any stragglers
    } else {
      // Some failed — partially approved; keep failed files on disk
      inspection.status = 'partially_approved';
      inspection.failedUploads = failedUploads.map((r) => ({
        filename: r.filename,
        originalName: inspection.photos.find((p) => p.filename === r.filename)?.originalName || r.filename,
        error: r.error || 'שגיאה לא ידועה',
      }));
    }

    await inspection.save();

    res.json({
      success: true,
      inspection,
      driveFolderName: folderName,
      driveFolderId: folderId,
      letter,
      uploadResults,
    });
  } catch (err) {
    console.error('Approval error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inspections/:id/retry-uploads — re-upload only the failed files
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

    // Collect the photo objects for the failed files
    const failedFilenames = new Set(inspection.failedUploads.map((f) => f.filename));
    const photosToRetry = inspection.photos.filter((p) => failedFilenames.has(p.filename));

    const localDir = path.join(UPLOADS_BASE, inspection._id.toString());
    const { uploadPhotosBatch } = require('../services/driveService');
    const results = await uploadPhotosBatch(photosToRetry, localDir, inspection.driveFolderId);

    // Update driveFileIds and delete successful local files
    for (const result of results) {
      if (result.success) {
        const photo = inspection.photos.find((p) => p.filename === result.filename);
        if (photo) photo.driveFileId = result.driveFileId;
        const localPath = path.join(localDir, result.filename);
        fs.unlink(localPath, () => {});
      }
    }

    const stillFailed = results.filter((r) => !r.success);

    if (stillFailed.length === 0) {
      inspection.status = 'approved';
      inspection.failedUploads = [];
      deleteInspectionFiles(inspection._id);
    } else {
      inspection.failedUploads = stillFailed.map((r) => ({
        filename: r.filename,
        originalName: inspection.photos.find((p) => p.filename === r.filename)?.originalName || r.filename,
        error: r.error || 'שגיאה לא ידועה',
      }));
    }

    await inspection.save();

    res.json({ success: true, inspection, retryResults: results });
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

module.exports = router;
