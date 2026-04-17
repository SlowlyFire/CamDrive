const express = require('express');
const Vehicle = require('../models/Vehicle');
const Inspection = require('../models/Inspection');
const router = express.Router();

// GET /api/vehicle/:plate — get vehicle info + inspection history
router.get('/:plate', async (req, res) => {
  try {
    const plate = req.params.plate.trim();
    const vehicle = await Vehicle.findOne({ licensePlate: plate });

    // Fetch all inspections for this plate regardless of whether vehicle doc exists
    const inspections = await Inspection.find({ licensePlate: plate })
      .sort({ createdAt: -1 })
      .select('-photos'); // photos list can be large; omit here

    if (!vehicle) {
      return res.json({ vehicle: null, inspections });
    }

    res.json({ vehicle, inspections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vehicles — list all vehicles (for manager dashboard)
router.get('/', async (req, res) => {
  try {
    const vehicles = await Vehicle.find().sort({ licensePlate: 1 });
    res.json(vehicles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
