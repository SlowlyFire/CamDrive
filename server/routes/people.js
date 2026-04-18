const express = require('express');
const Person = require('../models/Person');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/people — list all active people (no auth — team needs this)
router.get('/', async (req, res) => {
  try {
    const people = await Person.find({ active: true }).sort({ name: 1 });
    res.json(people);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/people — add a person (manager only)
router.post('/', requireAuth, async (req, res) => {
  try {
    const raw = req.body.name;
    if (!raw || !raw.trim()) {
      return res.status(400).json({ error: 'שם לא יכול להיות ריק' });
    }
    const name = raw.replace(/<[^>]*>/g, '').replace(/\0/g, '').trim();
    if (name.length > 50) {
      return res.status(400).json({ error: 'שם ארוך מדי (מקסימום 50 תווים)' });
    }
    const person = await Person.create({ name });
    res.status(201).json(person);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/people/:id — soft delete (manager only)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const person = await Person.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true }
    );
    if (!person) return res.status(404).json({ error: 'לא נמצא' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
