const mongoose = require('mongoose');

// Single-document collection — stores the one public share token for fuel cards.
const fuelShareTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('FuelShareToken', fuelShareTokenSchema);
