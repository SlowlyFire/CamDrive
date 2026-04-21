const mongoose = require('mongoose');

const vehicleTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('VehicleType', vehicleTypeSchema);
