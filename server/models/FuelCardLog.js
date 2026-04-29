const mongoose = require('mongoose');

const fuelCardLogSchema = new mongoose.Schema({
  cardId: { type: String, required: true, index: true },
  action: { type: String, enum: ['taken', 'returned'], required: true },
  person: { type: String, required: true },
  litersRemaining: { type: Number, default: null },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('FuelCardLog', fuelCardLogSchema);
