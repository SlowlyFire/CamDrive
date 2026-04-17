const express = require('express');
const Inspection = require('../models/Inspection');
const Vehicle = require('../models/Vehicle');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/stats — dashboard statistics (manager only)
router.get('/', requireAuth, async (req, res) => {
  try {
    const now = new Date();

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalThisWeek,
      totalThisMonth,
      pendingCount,
      vehicleCount,
      allInspections,
    ] = await Promise.all([
      Inspection.countDocuments({ createdAt: { $gte: startOfWeek } }),
      Inspection.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Inspection.countDocuments({ status: 'pending' }),
      Vehicle.countDocuments(),
      // For per-member stats: get member arrays from recent inspections
      Inspection.find({ createdAt: { $gte: startOfMonth } }).select('members'),
    ]);

    // Count inspections per team member this month
    const memberCounts = {};
    for (const insp of allInspections) {
      for (const member of insp.members) {
        memberCounts[member] = (memberCounts[member] || 0) + 1;
      }
    }

    // Count vehicles that have at least one enlistment folder but no release folder
    const vehicles = await Vehicle.find().select('driveFolders');
    let currentlyEnlisted = 0;
    for (const v of vehicles) {
      const hasEnlistment = v.driveFolders.some((f) => f.type === 'enlistment');
      const hasRelease = v.driveFolders.some((f) => f.type === 'release');
      if (hasEnlistment && !hasRelease) currentlyEnlisted++;
    }

    res.json({
      totalThisWeek,
      totalThisMonth,
      pendingCount,
      vehicleCount,
      currentlyEnlisted,
      memberCounts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
