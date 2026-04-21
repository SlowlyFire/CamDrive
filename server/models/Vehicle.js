const mongoose = require('mongoose');

const driveFolderSchema = new mongoose.Schema({
  folderId: String,
  folderName: String,
  type: { type: String, enum: ['enlistment', 'release', 'reserve', 'temporarily_disqualified', 'disqualified'] },
  createdAt: { type: Date, default: Date.now },
});

const vehicleSchema = new mongoose.Schema({
  licensePlate: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  // All Drive folders ever created for this vehicle, in order
  driveFolders: [driveFolderSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Vehicle', vehicleSchema);
