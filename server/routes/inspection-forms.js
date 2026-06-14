const express = require('express');
const router = express.Router();
const InspectionForm = require('../models/InspectionForm');
const { requireTeamCode } = require('../middleware/teamAuth');

// POST /api/inspection-forms — create/update (upsert by inspectionId)
router.post('/', requireTeamCode, async (req, res) => {
  try {
    const { inspectionId, formType, header, fuelGauge, sections, status } = req.body;
    if (!inspectionId) return res.status(400).json({ error: 'inspectionId נדרש' });
    if (!formType || !['enlistment', 'release'].includes(formType)) {
      return res.status(400).json({ error: 'formType לא תקין' });
    }

    const form = await InspectionForm.findOneAndUpdate(
      { inspectionId },
      {
        $set: {
          formType,
          header:      header      || {},
          fuelGauge:   fuelGauge   || {},
          sections:    sections    || {},
          status:      status      || 'draft',
          lastSavedAt: new Date(),
        },
        $setOnInsert: { inspectionId },
      },
      { upsert: true, new: true, runValidators: false }
    );
    res.status(201).json(form);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inspection-forms/:inspectionId
router.get('/:inspectionId', requireTeamCode, async (req, res) => {
  try {
    const form = await InspectionForm.findOne({ inspectionId: req.params.inspectionId });
    if (!form) return res.status(404).json({ error: 'לא נמצא' });
    res.json(form);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/inspection-forms/:inspectionId — partial update (upserts too)
router.patch('/:inspectionId', requireTeamCode, async (req, res) => {
  try {
    const { formType, header, fuelGauge, sections, status } = req.body;
    const set = { lastSavedAt: new Date() };
    if (formType            ) set.formType   = formType;
    if (header   !== undefined) set.header    = header;
    if (fuelGauge !== undefined) set.fuelGauge = fuelGauge;
    if (sections  !== undefined) set.sections  = sections;
    if (status    !== undefined) set.status    = status;

    const form = await InspectionForm.findOneAndUpdate(
      { inspectionId: req.params.inspectionId },
      {
        $set: set,
        $setOnInsert: {
          inspectionId: req.params.inspectionId,
          formType: formType || 'enlistment',
        },
      },
      { upsert: true, new: true, runValidators: false }
    );
    res.json(form);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
