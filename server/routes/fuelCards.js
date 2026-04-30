const express = require('express');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const FuelCard = require('../models/FuelCard');
const FuelCardLog = require('../models/FuelCardLog');
const FuelShareToken = require('../models/FuelShareToken');
const { requireAuth } = require('../middleware/auth');
const { requireTeamCode } = require('../middleware/teamAuth');

const router = express.Router();

const sanitize = (str) => String(str || '').replace(/<[^>]*>/g, '').trim();

// ── GET /api/fuel-cards — list all active cards (no auth, used by team + manager) ──
router.get('/', async (req, res) => {
  try {
    const cards = await FuelCard.find({ active: true }).sort({ createdAt: 1 });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/fuel-cards — add new card (manager auth) ───────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const cardId = sanitize(req.body.cardId).slice(0, 50);
    const fuelType = req.body.fuelType;
    if (!cardId) return res.status(400).json({ error: 'מזהה כרטיס נדרש' });
    if (!['סולר', 'בנזין'].includes(fuelType)) {
      return res.status(400).json({ error: 'סוג דלק לא תקין — יש לבחור סולר או בנזין' });
    }

    const litersRemaining = req.body.litersRemaining != null && req.body.litersRemaining !== ''
      ? Number(req.body.litersRemaining)
      : null;

    // Check for existing card with same ID regardless of active status
    const existing = await FuelCard.findOne({ cardId });
    if (existing) {
      if (existing.active) {
        return res.status(400).json({ error: 'כרטיס עם מזהה זה כבר קיים' });
      }
      // Reactivate the soft-deleted card with fresh state
      existing.fuelType = fuelType;
      existing.active = true;
      existing.status = 'available';
      existing.currentHolder = null;
      existing.litersRemaining = litersRemaining;
      existing.lastUpdated = new Date();
      await existing.save();
      return res.status(201).json(existing);
    }

    const card = new FuelCard({ cardId, fuelType, litersRemaining });
    await card.save();
    res.status(201).json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fuel-cards/deleted — all deleted cards with full log history ─────
// Must be defined before /:cardId routes so 'deleted' isn't treated as a cardId.
router.get('/deleted', requireAuth, async (req, res) => {
  try {
    const deletedCards = await FuelCard.find({ active: false }).sort({ lastUpdated: -1 });
    const result = await Promise.all(
      deletedCards.map(async (card) => {
        const logs = await FuelCardLog.find({ cardId: card.cardId }).sort({ createdAt: -1 });
        return { card, logs };
      })
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/fuel-cards/share-token — generate or retrieve share token ──────
// Must come before /:cardId routes to avoid being shadowed by the param.
router.post('/share-token', requireAuth, async (req, res) => {
  try {
    let tokenDoc = await FuelShareToken.findOne();
    if (!tokenDoc) tokenDoc = await FuelShareToken.create({ token: uuidv4() });
    res.json({ token: tokenDoc.token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fuel-cards/share/:token — public read-only snapshot ─────────────
router.get('/share/:token', async (req, res) => {
  try {
    const tokenDoc = await FuelShareToken.findOne({ token: req.params.token });
    if (!tokenDoc) return res.status(404).json({ error: 'קישור לא תקין' });
    const cards = await FuelCard.find({ active: true }).sort({ createdAt: 1 });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fuel-cards/:cardId/history — last 30 days of logs ───────────────
router.get('/:cardId/history', requireAuth, async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const logs = await FuelCardLog.find({
      cardId: req.params.cardId,
      createdAt: { $gte: since },
    }).sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fuel-cards/:cardId/check-balance — query Goodi SOAP API ─────────
router.get('/:cardId/check-balance', requireAuth, async (req, res) => {
  const cardSn = req.params.cardId;
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="http://tempuri.org/">
  <soap:Body>
    <tns:GetCashCardsBySN>
      <cardsn>${cardSn}</cardsn>
    </tns:GetCashCardsBySN>
  </soap:Body>
</soap:Envelope>`;

  try {
    const xml = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'www.goodi.co.il',
        port: 80,
        path: '/AdminFuel/WS/FuelWSAdm.asmx',
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': 'http://tempuri.org/GetCashCardsBySN',
          'Content-Length': Buffer.byteLength(soapBody),
        },
      };
      const req = http.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
      req.write(soapBody);
      req.end();
    });

    // Parse liters left from XML response
    const match = xml.match(/<total_x0020_liter_x0020_left[^>]*>([^<]*)<\/total_x0020_liter_x0020_left>/);
    if (!match) {
      return res.status(404).json({ error: 'כרטיס לא נמצא באתר גודי' });
    }
    const liters = parseFloat(match[1]);
    if (isNaN(liters)) {
      return res.status(404).json({ error: 'לא ניתן לקרוא יתרה' });
    }
    res.json({ liters });
  } catch (err) {
    res.status(502).json({ error: 'שגיאה בחיבור לאתר גודי' });
  }
});

// ── POST /api/fuel-cards/:cardId/take — team member takes a card ─────────────
router.post('/:cardId/take', requireTeamCode, async (req, res) => {
  try {
    const card = await FuelCard.findOne({ cardId: req.params.cardId, active: true });
    if (!card) return res.status(404).json({ error: 'כרטיס לא נמצא' });
    if (card.status === 'taken') {
      return res.status(400).json({ error: `הכרטיס כבר נמצא אצל ${card.currentHolder}` });
    }
    if (card.status === 'empty') return res.status(400).json({ error: 'הכרטיס ריק — יש להחזיר למשרד' });
    if (card.status === 'deleted') return res.status(400).json({ error: 'כרטיס לא פעיל' });

    const person = sanitize(req.body.person).slice(0, 100);
    if (!person) return res.status(400).json({ error: 'שם נדרש' });

    const liters = req.body.litersRemaining != null && req.body.litersRemaining !== ''
      ? Number(req.body.litersRemaining)
      : null;
    const notes = sanitize(req.body.notes || '').slice(0, 500);

    card.status = 'taken';
    card.currentHolder = person;
    card.litersRemaining = liters;
    card.lastUpdated = new Date();
    await card.save();

    await FuelCardLog.create({ cardId: card.cardId, action: 'taken', person, litersRemaining: liters, notes });

    res.json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/fuel-cards/:cardId/return — team member returns a card ─────────
router.post('/:cardId/return', requireTeamCode, async (req, res) => {
  try {
    const card = await FuelCard.findOne({ cardId: req.params.cardId, active: true });
    if (!card) return res.status(404).json({ error: 'כרטיס לא נמצא' });
    if (card.status === 'available') return res.status(400).json({ error: 'הכרטיס כבר בחמל' });
    if (card.status === 'deleted') return res.status(400).json({ error: 'כרטיס לא פעיל' });

    const person = sanitize(req.body.person || card.currentHolder || '').slice(0, 100);
    const liters = req.body.litersRemaining != null && req.body.litersRemaining !== ''
      ? Number(req.body.litersRemaining)
      : null;
    const notes = sanitize(req.body.notes || '').slice(0, 500);
    // Auto-empty when 0 liters entered, or when isEmpty flag is set explicitly
    const isEmpty = req.body.isEmpty === true || req.body.isEmpty === 'true' || liters === 0;

    card.status = isEmpty ? 'empty' : 'available';
    card.currentHolder = null;
    card.litersRemaining = isEmpty ? 0 : liters;
    card.lastUpdated = new Date();
    await card.save();

    await FuelCardLog.create({
      cardId: card.cardId,
      action: 'returned',
      person,
      litersRemaining: isEmpty ? 0 : liters,
      notes: isEmpty ? (notes ? `${notes} (ריק)` : 'ריק') : notes,
    });

    res.json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/fuel-cards/:id — soft delete (manager auth) ──────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const card = await FuelCard.findById(req.params.id);
    if (!card) return res.status(404).json({ error: 'כרטיס לא נמצא' });
    card.active = false;
    card.status = 'deleted';
    card.lastUpdated = new Date();
    await card.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
