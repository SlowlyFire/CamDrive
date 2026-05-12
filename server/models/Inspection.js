const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const photoSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  r2Key: { type: String, default: null },      // R2 object key while pending
  driveFileId: { type: String, default: null }, // set after approved → Drive
  uploadedAt: { type: Date, default: Date.now },
});

const documentSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  r2Key: { type: String, default: null },
  driveFileId: { type: String, default: null },
  uploadedAt: { type: Date, default: Date.now },
});

const inspectionSchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
  licensePlate: { type: String, required: true, trim: true },
  type: { type: String, enum: ['enlistment', 'release'], required: true },
  vehicleType: { type: String, default: '' },
  members: { type: [String], default: [] },
  location: { type: String, trim: true, default: '' },
  vehicleHours: { type: Number, default: null },
  vehicleHoursDigital: { type: Number, default: null },
  vehicleHoursAnalog: { type: Number, default: null },
  kilometers: { type: Number, default: null },
  notes: { type: String, default: '' },
  securityCode: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'uploading', 'approved', 'partially_approved', 'rejected', 'deleted', 'reserve', 'temporarily_disqualified', 'disqualified'],
    default: 'pending',
  },
  classification: {
    type: String,
    enum: [null, 'reserve', 'temporarily_disqualified', 'disqualified'],
    default: null,
  },
  driveFolderId: { type: String, default: null },
  driveDocsFolderId: { type: String, default: null },
  drivePhotosFolderId: { type: String, default: null },
  failedUploads: {
    type: [{
      filename:     { type: String, required: true },
      originalName: { type: String, default: '' },
      error:        { type: String, default: '' },
    }],
    default: [],
    _id: false,
  },
  photos: [photoSchema],
  documents: [documentSchema],
  shareToken: { type: String, default: () => uuidv4(), unique: true },
  createdAt: { type: Date, default: Date.now },
  approvedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
  processedAt: { type: Date, default: null },
  classifiedAt: { type: Date, default: null },
  approvedBy: { type: String, default: null },
  rejectedBy: { type: String, default: null },
});

inspectionSchema.index({ members: 1 });
inspectionSchema.index({ licensePlate: 1 });
inspectionSchema.index({ status: 1 });

module.exports = mongoose.model('Inspection', inspectionSchema);
