const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireTeamCode } = require('../middleware/teamAuth');

const router = express.Router();
const UPLOADS_BASE = path.join(__dirname, '../uploads');

// Strict uploadId format to prevent path traversal
const UPLOAD_ID_RE = /^[a-zA-Z0-9_-]{4,80}$/;

const chunkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tmpDir = path.join(UPLOADS_BASE, '_chunk_tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, unique);
  },
});

const uploadChunk = multer({
  storage: chunkStorage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB per chunk (5 MB chunks + overhead)
});

// POST /api/upload/chunk
// Body fields: uploadId, chunkIndex, totalChunks, originalName
// File field: chunk
router.post('/chunk', requireTeamCode, uploadChunk.single('chunk'), async (req, res) => {
  try {
    const { uploadId, chunkIndex, totalChunks, originalName } = req.body;

    if (!uploadId || !UPLOAD_ID_RE.test(uploadId)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'uploadId לא תקין' });
    }
    if (chunkIndex === undefined || !totalChunks) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'חסרים פרמטרים' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'לא התקבל קובץ' });
    }

    const total = Number(totalChunks);
    const idx = Number(chunkIndex);

    if (isNaN(idx) || idx < 0 || idx >= total) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'chunkIndex לא תקין' });
    }

    // Move chunk to the upload's staging directory
    const chunksDir = path.join(UPLOADS_BASE, '_chunks', uploadId);
    fs.mkdirSync(chunksDir, { recursive: true });
    const destPath = path.join(chunksDir, `chunk_${idx}`);
    fs.renameSync(req.file.path, destPath);

    // Count received chunks
    const received = fs.readdirSync(chunksDir).filter((f) => f.startsWith('chunk_')).length;

    if (received < total) {
      return res.json({ done: false, received });
    }

    // All chunks received — assemble into _tmp
    const ext = path.extname(originalName || '') || '';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const filename = `${unique}${ext}`;
    const tmpDir = path.join(UPLOADS_BASE, '_tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const outPath = path.join(tmpDir, filename);
    const outStream = fs.createWriteStream(outPath);

    for (let i = 0; i < total; i++) {
      const chunkPath = path.join(chunksDir, `chunk_${i}`);
      if (!fs.existsSync(chunkPath)) {
        outStream.destroy();
        fs.rmSync(chunksDir, { recursive: true, force: true });
        return res.status(400).json({ error: `חסר חלק ${i} — יש להתחיל מחדש` });
      }
      const data = fs.readFileSync(chunkPath);
      outStream.write(data);
    }

    await new Promise((resolve, reject) => {
      outStream.end();
      outStream.on('finish', resolve);
      outStream.on('error', reject);
    });

    // Cleanup staging chunks
    fs.rmSync(chunksDir, { recursive: true, force: true });

    res.json({ done: true, filename, originalName: originalName || filename });
  } catch (err) {
    console.error('Chunk upload error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
