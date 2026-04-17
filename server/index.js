require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

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

// ── Middleware ─────────────────────────────────────────────────────────────
// CORS is only needed in development (Vite dev server on a different port).
// In production, Express serves everything from the same origin.
if (!isProd) {
  app.use(cors());
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── API routes ─────────────────────────────────────────────────────────────
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
// In production, Express serves the built React app from client/dist.
// The Vite dev server (with its proxy) handles this in development.
if (isProd) {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));

  // SPA fallback — any route not matched by the API serves index.html so
  // React Router can handle client-side navigation.
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ── Database ───────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`CamDrive server running on port ${PORT} [${isProd ? 'production' : 'development'}]`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

module.exports = app;
