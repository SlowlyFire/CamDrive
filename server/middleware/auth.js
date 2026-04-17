const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'אין הרשאה — נדרשת כניסת מנהל' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.manager = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'טוקן לא תקין או פג תוקף' });
  }
}

module.exports = { requireAuth };
