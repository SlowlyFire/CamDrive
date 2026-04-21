const express = require('express');
const VehicleType = require('../models/VehicleType');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/vehicle-types — no auth (team can see list)
router.get('/', async (req, res) => {
  try {
    const types = await VehicleType.find({ active: true }).sort({ name: 1 });
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vehicle-types — manager auth
router.post('/', requireAuth, async (req, res) => {
  try {
    const name = (req.body.name || '').trim().slice(0, 50);
    if (!name) return res.status(400).json({ error: 'נא להזין שם' });
    const existing = await VehicleType.findOne({ name });
    if (existing) {
      if (!existing.active) { existing.active = true; await existing.save(); return res.json(existing); }
      return res.status(400).json({ error: 'סוג כלי כבר קיים' });
    }
    const type = await VehicleType.create({ name });
    res.status(201).json(type);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/vehicle-types/:id — manager auth
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await VehicleType.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
