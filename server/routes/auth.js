const express = require('express');
const jwt = require('jsonwebtoken');
const { verifyAdminPassword, verifyTeamPassword } = require('../middleware/passwords');
const Manager = require('../models/Manager');
const router = express.Router();

// POST /api/auth/login — manager
router.post('/login', async (req, res) => {
  const { password, managerName } = req.body;

  if (!managerName || !managerName.trim()) {
    return res.status(400).json({ error: 'יש לבחור שם מנהל' });
  }
  if (!password || !(await verifyAdminPassword(password))) {
    return res.status(401).json({ error: 'סיסמה שגויה' });
  }

  const name = managerName.trim();
  const managerExists = await Manager.findOne({ name, active: true });
  if (!managerExists) {
    return res.status(400).json({ error: 'שם מנהל לא קיים' });
  }

  const token = jwt.sign({ role: 'manager', managerName: name }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });

  res.json({ token });
});

// POST /api/auth/team-login — verify team code (no token issued; code is sent as header on every request)
router.post('/team-login', async (req, res) => {
  const { code } = req.body;
  if (!code || !(await verifyTeamPassword(code))) {
    return res.status(403).json({ error: 'קוד צוות שגוי' });
  }
  res.json({ ok: true });
});

module.exports = router;
