function requireTeamCode(req, res, next) {
  const code = req.headers['x-team-code'];
  if (!code || code !== process.env.TEAM_PASSWORD) {
    return res.status(403).json({ error: 'קוד צוות שגוי' });
  }
  next();
}

module.exports = { requireTeamCode };
