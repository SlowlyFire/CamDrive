/**
 * Reset inspections stuck in 'uploading' status back to 'pending'.
 * Run from the server directory: node scripts/reset-stuck-inspections.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const inspectionSchema = new mongoose.Schema({
  licensePlate: String,
  status: String,
  photos: [{ driveFileId: String }],
  documents: [{ driveFileId: String }],
}, { strict: false });

const Inspection = mongoose.model('Inspection', inspectionSchema);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const stuck = await Inspection.find({ status: 'uploading' });
  console.log(`Found ${stuck.length} inspection(s) stuck in 'uploading' status.\n`);

  for (const insp of stuck) {
    const hadUploads = insp.photos.some(p => p.driveFileId) ||
                       (insp.documents || []).some(d => d.driveFileId);
    console.log(`  ${insp._id} (${insp.licensePlate}) — ${insp.photos.length} photos, has Drive uploads: ${hadUploads}`);
    insp.status = 'pending';
    await insp.save();
    console.log(`    → reset to 'pending'`);
  }

  console.log('\nDone.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
