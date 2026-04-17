const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

// POST /api/auth/login
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

module.exports = router;
