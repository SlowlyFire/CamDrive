const express = require('express');
const path = require('path');
const { requireTeamCode } = require('../middleware/teamAuth');
const { getPresignedUploadUrl } = require('../services/r2Service');

const router = express.Router();

// Allowed extensions — mirrors the multer fileFilter
const ALLOWED_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif',
  '.mp4', '.mov', '.avi', '.mkv',
]);

/**
 * GET /api/upload/presign?filename=photo.jpg&contentType=image/jpeg
 *
 * Returns a short-lived presigned PUT URL so the client can upload
 * a file directly to Cloudflare R2 without routing through the server.
 * The `key` in the response must be sent back in the inspection POST body.
 */
router.get('/presign', requireTeamCode, async (req, res) => {
  try {
    const { filename, contentType } = req.query;
    if (!filename) return res.status(400).json({ error: 'filename is required' });

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      return res.status(400).json({ error: `סוג קובץ לא נתמך (${ext})` });
    }

    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const key = `pending/${unique}${ext}`;
    const url = await getPresignedUploadUrl(key, contentType || 'application/octet-stream', 3600);

    res.json({ url, key });
  } catch (err) {
    console.error('Presign error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
