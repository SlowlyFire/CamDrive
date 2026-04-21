const express = require('express');
const Manager = require('../models/Manager');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/managers — list all managers (public — needed by login page)
router.get('/', async (req, res) => {
  try {
    const managers = await Manager.find({ active: true }).sort({ name: 1 });
    res.json(managers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/managers — add a manager
router.post('/', requireAuth, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'שם חובה' });
    const manager = await Manager.create({ name });
    res.status(201).json(manager);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'מנהל עם שם זה כבר קיים' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/managers/:id — remove a manager
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await Manager.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
