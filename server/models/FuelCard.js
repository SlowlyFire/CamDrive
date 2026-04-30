const mongoose = require('mongoose');

const fuelCardSchema = new mongoose.Schema({
  cardId: { type: String, required: true, unique: true, trim: true },
  fuelType: { type: String, enum: ['סולר', 'בנזין'], required: true },
  status: {
    type: String,
    enum: ['available', 'taken', 'empty', 'deleted'],
    default: 'available',
  },
  currentHolder: { type: String, default: null },
  litersRemaining: { type: Number, default: null },
  balanceCheckedAt: { type: Date, default: null },
  lastUpdated: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  active: { type: Boolean, default: true },
});

fuelCardSchema.index({ cardId: 1 });

module.exports = mongoose.model('FuelCard', fuelCardSchema);
