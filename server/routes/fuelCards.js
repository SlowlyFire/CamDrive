const express = require('express');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const https = require('https');
const FuelCard = require('../models/FuelCard');
const FuelCardLog = require('../models/FuelCardLog');
const FuelShareToken = require('../models/FuelShareToken');
const { requireAuth } = require('../middleware/auth');
const { requireTeamCode } = require('../middleware/teamAuth');

const router = express.Router();

const sanitize = (str) => String(str || '').replace(/<[^>]*>/g, '').trim();

// ── HTTP helper ───────────────────────────────────────────────────────────────
function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const lib = (options.protocol === 'https:' || options.port === 443) ? https : http;
    const req = lib.request(options, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// ── Goodi balance fetch helper ────────────────────────────────────────────────
// Scrapes "ליטרים שנותרו" from Goodi WebForms and updates the card in DB.
// Fire-and-forget safe — catches all errors internally.
// Does NOT flip status to 'empty' if card is currently 'taken' (someone has it).
async function fetchAndUpdateBalance(cardId) {
  try {
    const getRes = await makeRequest({
      protocol: 'https:',
      hostname: 'fueladmin.goodi.co.il',
      port: 443,
      path: '/_fuel/',
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; CamDrive/1.0)',
      },
    });

    const extract = (html, name) => {
      const m = html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`, 'i'))
               || html.match(new RegExp(`id="${name}"[^>]*value="([^"]*)"`, 'i'));
      return m ? m[1] : null;
    };

    const cookies = (getRes.headers['set-cookie'] || [])
      .map((c) => c.split(';')[0])
      .join('; ');

    const formData = new URLSearchParams({
      RadStyleSheetManager1_TSSM: extract(getRes.body, 'RadStyleSheetManager1_TSSM') || '',
      RadScriptManager1_TSM:      extract(getRes.body, 'RadScriptManager1_TSM') || '',
      __VIEWSTATE:                 extract(getRes.body, '__VIEWSTATE') || '',
      __VIEWSTATEGENERATOR:        extract(getRes.body, '__VIEWSTATEGENERATOR') || '',
      __EVENTVALIDATION:           extract(getRes.body, '__EVENTVALIDATION') || '',
      ddSearchSelect:              '3',
      tbSearch:                    cardId,
      btnSearch:                   'חפש',
    }).toString();

    const postRes = await makeRequest({
      protocol: 'https:',
      hostname: 'fueladmin.goodi.co.il',
      port: 443,
      path: '/_fuel/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formData),
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; CamDrive/1.0)',
        'Referer': 'https://fueladmin.goodi.co.il/_fuel/',
        ...(cookies ? { 'Cookie': cookies } : {}),
      },
    }, formData);

    const match = postRes.body.match(
      /ליטרים שנותרו[^<]*<\/td>\s*<td[^>]*>\s*([\d.]+)/
    );
    if (!match) return;

    const liters = parseFloat(match[1]);
    if (isNaN(liters)) return;

    const card = await FuelCard.findOne({ cardId, active: true });
    if (!card) return;

    card.litersRemaining = liters;
    card.balanceCheckedAt = new Date();
    // Auto-empty when < 2L, but don't override 'taken' (person still has the card)
    if (liters < 2 && card.status !== 'taken') {
      card.status = 'empty';
    }
    await card.save();
  } catch {
    // silent — never block the main action
  }
}

// ── GET /api/fuel-cards — list all active cards (no auth) ────────────────────
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

    const existing = await FuelCard.findOne({ cardId });
    if (existing) {
      if (existing.active) {
        return res.status(400).json({ error: 'כרטיס עם מזהה זה כבר קיים' });
      }
      existing.fuelType = fuelType;
      existing.active = true;
      existing.status = 'available';
      existing.currentHolder = null;
      existing.litersRemaining = litersRemaining;
      existing.balanceCheckedAt = null;
      existing.lastUpdated = new Date();
      await existing.save();
      // Fire-and-forget balance fetch after card creation
      fetchAndUpdateBalance(cardId);
      return res.status(201).json(existing);
    }

    const card = new FuelCard({ cardId, fuelType, litersRemaining });
    await card.save();
    // Fire-and-forget balance fetch after card creation
    fetchAndUpdateBalance(cardId);
    res.status(201).json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fuel-cards/deleted — all deleted cards with full log history ─────
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

// ── POST /api/fuel-cards/share-token — generate or retrieve share token ───────
router.post('/share-token', requireAuth, async (req, res) => {
  try {
    let tokenDoc = await FuelShareToken.findOne();
    if (!tokenDoc) tokenDoc = await FuelShareToken.create({ token: uuidv4() });
    res.json({ token: tokenDoc.token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fuel-cards/share/:token — public read-only snapshot ──────────────
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

// ── POST /api/fuel-cards/:cardId/refresh-balance — manual sync fetch (manager) ─
router.post('/:cardId/refresh-balance', requireAuth, async (req, res) => {
  try {
    const card = await FuelCard.findOne({ cardId: req.params.cardId, active: true });
    if (!card) return res.status(404).json({ error: 'כרטיס לא נמצא' });

    // Same scraping logic but synchronous — returns updated card
    const getRes = await makeRequest({
      protocol: 'https:',
      hostname: 'fueladmin.goodi.co.il',
      port: 443,
      path: '/_fuel/',
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; CamDrive/1.0)',
      },
    });

    const extract = (html, name) => {
      const m = html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`, 'i'))
               || html.match(new RegExp(`id="${name}"[^>]*value="([^"]*)"`, 'i'));
      return m ? m[1] : null;
    };

    const cookies = (getRes.headers['set-cookie'] || [])
      .map((c) => c.split(';')[0])
      .join('; ');

    const formData = new URLSearchParams({
      RadStyleSheetManager1_TSSM: extract(getRes.body, 'RadStyleSheetManager1_TSSM') || '',
      RadScriptManager1_TSM:      extract(getRes.body, 'RadScriptManager1_TSM') || '',
      __VIEWSTATE:                 extract(getRes.body, '__VIEWSTATE') || '',
      __VIEWSTATEGENERATOR:        extract(getRes.body, '__VIEWSTATEGENERATOR') || '',
      __EVENTVALIDATION:           extract(getRes.body, '__EVENTVALIDATION') || '',
      ddSearchSelect:              '3',
      tbSearch:                    req.params.cardId,
      btnSearch:                   'חפש',
    }).toString();

    const postRes = await makeRequest({
      protocol: 'https:',
      hostname: 'fueladmin.goodi.co.il',
      port: 443,
      path: '/_fuel/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formData),
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; CamDrive/1.0)',
        'Referer': 'https://fueladmin.goodi.co.il/_fuel/',
        ...(cookies ? { 'Cookie': cookies } : {}),
      },
    }, formData);

    const match = postRes.body.match(
      /ליטרים שנותרו[^<]*<\/td>\s*<td[^>]*>\s*([\d.]+)/
    );
    if (!match) return res.status(404).json({ error: 'כרטיס לא נמצא באתר גודי' });

    const liters = parseFloat(match[1]);
    if (isNaN(liters)) return res.status(404).json({ error: 'לא ניתן לקרוא יתרה' });

    card.litersRemaining = liters;
    card.balanceCheckedAt = new Date();
    if (liters < 2 && card.status !== 'taken') {
      card.status = 'empty';
    }
    await card.save();
    res.json(card);
  } catch (err) {
    res.status(502).json({ error: 'שגיאה בחיבור לאתר גודי' });
  }
});

// ── POST /api/fuel-cards/:cardId/take — team member takes a card ──────────────
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

    // Fire-and-forget: update balance from Goodi after take
    fetchAndUpdateBalance(card.cardId);

    res.json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/fuel-cards/:cardId/return — team member returns a card ──────────
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
    // Auto-empty: explicit toggle, 0 liters, or < 2 liters on manual entry
    const isEmpty = req.body.isEmpty === true || req.body.isEmpty === 'true'
      || (liters !== null && liters < 2);

    card.status = isEmpty ? 'empty' : 'available';
    card.currentHolder = null;
    card.litersRemaining = isEmpty ? (liters ?? 0) : liters;
    card.lastUpdated = new Date();
    await card.save();

    await FuelCardLog.create({
      cardId: card.cardId,
      action: 'returned',
      person,
      litersRemaining: card.litersRemaining,
      notes: isEmpty ? (notes ? `${notes} (ריק)` : 'ריק') : notes,
    });

    // Fire-and-forget: update balance from Goodi after return
    fetchAndUpdateBalance(card.cardId);

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
