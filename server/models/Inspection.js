const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const photoSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true,
  },
  originalName: {
    type: String,
    required: true,
  },
  driveFileId: {
    type: String,
    default: null,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

const inspectionSchema = new mongoose.Schema({
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    default: null,
  },
  licensePlate: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ['enlistment', 'release'],
    required: true,
  },
  members: {
    type: [String],
    default: [],
  },
  location: {
    type: String,
    trim: true,
    default: '',
  },
  vehicleHours: {
    type: Number,
    default: null,
  },
  notes: {
    type: String,
    default: '',
  },
  securityCode: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'partially_approved', 'rejected', 'deleted'],
    default: 'pending',
  },
  driveFolderId: {
    type: String,
    default: null,
  },
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
  shareToken: {
    type: String,
    default: () => uuidv4(),
    unique: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  approvedAt: {
    type: Date,
    default: null,
  },
  rejectedAt: {
    type: Date,
    default: null,
  },
  rejectionReason: {
    type: String,
    default: '',
  },
});

// Index for fast lookup by person name
inspectionSchema.index({ members: 1 });
inspectionSchema.index({ licensePlate: 1 });
inspectionSchema.index({ status: 1 });
// shareToken already has a unique index from the field definition above

module.exports = mongoose.model('Inspection', inspectionSchema);
