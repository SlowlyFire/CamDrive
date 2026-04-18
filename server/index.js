require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const { initPasswordHashes } = require('./middleware/passwords');
const { apiLimiter, authLimiter } = require('./middleware/rateLimiters');
const authRoutes = require('./routes/auth');
const peopleRoutes = require('./routes/people');
const vehicleRoutes = require('./routes/vehicles');
const inspectionRoutes = require('./routes/inspections');
const statsRoutes = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// Ensure the uploads directory exists at startup (Railway filesystem is
// ephemeral — this directory is recreated on every deploy/restart).
// NOTE: Pending-inspection photos stored here will be lost on redeploy.
// For a persistent solution, replace local storage with an object store
// such as AWS S3 or Cloudflare R2.
const UPLOADS_BASE = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS_BASE, { recursive: true });

// ── Security headers (helmet) ──────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"], // Tailwind injects some inline styles
      imgSrc:      ["'self'", 'data:', 'https://lh3.googleusercontent.com'],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      frameSrc:    ["'none'"],
      upgradeInsecureRequests: [],
    },
  } : false, // Disable CSP in dev — Vite HMR needs relaxed rules
  crossOriginEmbedderPolicy: false, // Keep off; required for Drive image loading
}));

// ── CORS ───────────────────────────────────────────────────────────────────
// Production: only the deployed domain (or ALLOWED_ORIGIN override).
// Development: allow Vite dev server on localhost:5173.
const allowedOrigin = isProd
  ? (process.env.ALLOWED_ORIGIN || 'https://camdrive-production.up.railway.app')
  : 'http://localhost:5173';

app.use(cors({
  origin: allowedOrigin,
  optionsSuccessStatus: 200,
}));

// ── Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' })); // JSON bodies are small; photos go via multipart
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/api', apiLimiter);
app.use('/api/auth/login',      authLimiter);
app.use('/api/auth/team-login', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/people', peopleRoutes);
app.use('/api/vehicle', vehicleRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/inspections', inspectionRoutes);
app.use('/api/stats', statsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── Production static serving ──────────────────────────────────────────────
if (isProd) {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ── Startup sequence ───────────────────────────────────────────────────────
initPasswordHashes()
  .then(() => mongoose.connect(process.env.MONGODB_URI))
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`CamDrive server running on port ${PORT} [${isProd ? 'production' : 'development'}]`);
    });
  })
  .catch((err) => {
    console.error('Startup error:', err);
    process.exit(1);
  });

module.exports = app;
