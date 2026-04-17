const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

// POST /api/auth/login — manager
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'סיסמה שגויה' });
  }

  const token = jwt.sign({ role: 'manager' }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });

  res.json({ token });
});

// POST /api/auth/team-login — verify team code (no token issued; code is sent as header on every request)
router.post('/team-login', (req, res) => {
  const { code } = req.body;
  if (!code || code !== process.env.TEAM_PASSWORD) {
    return res.status(403).json({ error: 'קוד צוות שגוי' });
  }
  res.json({ ok: true });
});

module.exports = router;
