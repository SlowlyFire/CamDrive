const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const Inspection = require('../models/Inspection');
const { requireAuth } = require('../middleware/auth');
const { processApproval, getDriveClient } = require('../services/driveService');
const router = express.Router();

const UPLOADS_BASE = path.join(__dirname, '../uploads');

// ── Multer config ──────────────────────────────────────────────────────────
// Files land in a temp directory first; moved to uploads/{inspectionId}/ after creation
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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('קבצי תמונה בלבד'));
  },
});

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
router.post('/', upload.array('photos'), async (req, res) => {
  try {
    let data = {};
    if (req.body.data) {
      data = JSON.parse(req.body.data);
    } else {
      data = req.body;
    }

    const { licensePlate, type, members, location, vehicleHours, notes, securityCode } = data;

    if (!licensePlate || !type) {
      return res.status(400).json({ error: 'מספר רישוי וסוג בחינה הם שדות חובה' });
    }
    if (!['enlistment', 'release'].includes(type)) {
      return res.status(400).json({ error: 'סוג בחינה לא תקין' });
    }

    const inspection = await Inspection.create({
      licensePlate,
      type,
      members: Array.isArray(members) ? members : members ? [members] : [],
      location: location || '',
      vehicleHours: vehicleHours != null ? Number(vehicleHours) : null,
      notes: notes || '',
      securityCode: securityCode || '',
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

// GET /api/inspections/pending — all pending inspections (manager)
router.get('/pending', requireAuth, async (req, res) => {
  try {
    const inspections = await Inspection.find({ status: 'pending' }).sort({ createdAt: -1 });
    res.json(inspections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inspections/my/:personName — pending + rejected inspections for a person
router.get('/my/:personName', async (req, res) => {
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

    if (inspection.status === 'approved') {
      // Serve from Drive
      if (!photo.driveFileId) {
        return res.status(404).json({ error: 'קובץ לא נמצא ב-Drive' });
      }
      const drive = getDriveClient();
      const driveRes = await drive.files.get(
        { fileId: photo.driveFileId, alt: 'media' },
        { responseType: 'stream' }
      );
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      driveRes.data.pipe(res);
    } else {
      // Serve from local disk
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
router.put('/:id/photos', upload.array('photos'), async (req, res) => {
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
router.delete('/:id/photos/:photoFilename', async (req, res) => {
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

    // Save Drive file IDs back onto each photo record
    for (const result of uploadResults) {
      if (result.success) {
        const photo = inspection.photos.find((p) => p.filename === result.filename);
        if (photo) photo.driveFileId = result.driveFileId;
      }
    }

    // Update inspection status
    inspection.status = 'approved';
    inspection.approvedAt = new Date();
    inspection.vehicleId = vehicle._id;
    inspection.driveFolderId = folderId;
    await inspection.save();

    // Delete local files after successful upload
    deleteInspectionFiles(inspection._id);

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

// POST /api/inspections/:id/reject — manager rejects
router.post('/:id/reject', requireAuth, async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'לא נמצא' });
    if (inspection.status !== 'pending') {
      return res.status(400).json({ error: 'ניתן לדחות רק בחינות במצב ממתין' });
    }

    const { reason } = req.body;
    inspection.status = 'rejected';
    inspection.rejectedAt = new Date();
    inspection.rejectionReason = reason || '';
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

    if (inspection.status === 'approved') {
      // Files are on Drive — stream each file from Drive API
      if (!inspection.driveFolderId) {
        return res.status(404).json({ error: 'תיקיית Drive לא נמצאה' });
      }
      const drive = getDriveClient();
      const listRes = await drive.files.list({
        q: `'${inspection.driveFolderId}' in parents and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1000,
      });
      const driveFiles = listRes.data.files || [];
      for (const driveFile of driveFiles) {
        const streamRes = await drive.files.get(
          { fileId: driveFile.id, alt: 'media' },
          { responseType: 'stream' }
        );
        archive.append(streamRes.data, { name: driveFile.name });
      }
    } else {
      // Files are on local disk (pending / rejected)
      const inspDir = path.join(UPLOADS_BASE, inspection._id.toString());
      if (!fs.existsSync(inspDir)) {
        return res.status(404).json({ error: 'קבצי התמונות לא נמצאו בשרת' });
      }
      for (const photo of inspection.photos) {
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
router.put('/:id/resubmit', async (req, res) => {
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
