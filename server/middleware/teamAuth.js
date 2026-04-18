const { verifyTeamPassword } = require('./passwords');

async function requireTeamCode(req, res, next) {
  const code = req.headers['x-team-code'];
  if (!code || !(await verifyTeamPassword(code))) {
    return res.status(403).json({ error: 'קוד צוות שגוי' });
  }
  next();
}

module.exports = { requireTeamCode };
