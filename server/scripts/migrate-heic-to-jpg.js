/**
 * One-time migration: convert all .heic/.heif files in R2 to .jpg
 * and update the corresponding MongoDB records.
 *
 * Run from the server directory:
 *   node scripts/migrate-heic-to-jpg.js
 *
 * Requires: MONGODB_URI + R2 env vars in .env (same as the app).
 * Safe to re-run — skips files that are already .jpg.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const convert = require('heic-convert');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// ── R2 client ──────────────────────────────────────────────────────────────
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
const BUCKET = process.env.R2_BUCKET_NAME;

// ── Mongoose model (inline — avoids importing app code) ────────────────────
const photoSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  r2Key: String,
  driveFileId: String,
  uploadedAt: Date,
}, { _id: true });

const inspectionSchema = new mongoose.Schema({
  photos: [photoSchema],
  documents: [photoSchema],
}, { strict: false });

const Inspection = mongoose.model('Inspection', inspectionSchema);

const HEIC_RE = /\.hei[cf]$/i;

async function downloadBuffer(key) {
  const res = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function uploadBuffer(key, buffer, contentType) {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
}

async function deleteKey(key) {
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch { /* ignore */ }
}

async function main() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.\n');

  // Find all inspections that have at least one .heic/.heif photo or document
  const inspections = await Inspection.find({
    $or: [
      { 'photos.filename': { $regex: /\.hei[cf]$/i } },
      { 'documents.filename': { $regex: /\.hei[cf]$/i } },
    ],
  });

  console.log(`Found ${inspections.length} inspection(s) with HEIC files.\n`);

  let converted = 0;
  let failed = 0;

  for (const insp of inspections) {
    const arrays = [
      { name: 'photos', items: insp.photos },
      { name: 'documents', items: insp.documents },
    ];

    let dirty = false;

    for (const { name, items } of arrays) {
      for (const item of items) {
        if (!HEIC_RE.test(item.filename)) continue;
        if (!item.r2Key) {
          console.log(`  SKIP ${item.filename} — no r2Key (already on Drive or legacy)`);
          continue;
        }

        const oldKey = item.r2Key;
        const newKey = oldKey.replace(HEIC_RE, '.jpg');
        const newFilename = item.filename.replace(HEIC_RE, '.jpg');

        process.stdout.write(`  ${insp._id} / ${name} / ${item.filename} → ${newFilename}  `);

        try {
          // Download HEIC from R2
          const heicBuf = await downloadBuffer(oldKey);

          // Convert to JPEG (pure JS — works on macOS without native HEIF libs)
          const jpgBuf = Buffer.from(await convert({
            buffer: heicBuf,
            format: 'JPEG',
            quality: 0.8,
          }));

          // Upload JPEG with new key
          await uploadBuffer(newKey, jpgBuf, 'image/jpeg');

          // Delete old HEIC
          await deleteKey(oldKey);

          // Update MongoDB record
          item.r2Key = newKey;
          item.filename = newFilename;
          if (item.originalName && HEIC_RE.test(item.originalName)) {
            item.originalName = item.originalName.replace(HEIC_RE, '.jpg');
          }

          dirty = true;
          converted++;
          console.log(`✅ (${(heicBuf.length / 1024).toFixed(0)}KB → ${(jpgBuf.length / 1024).toFixed(0)}KB)`);
        } catch (err) {
          failed++;
          console.log(`❌ ${err.message}`);
        }
      }
    }

    if (dirty) {
      await insp.save();
    }
  }

  console.log(`\nDone.  Converted: ${converted}  Failed: ${failed}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
