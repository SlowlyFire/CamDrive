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

// ── HTTP helper — wraps http/https.request as a promise ──────────────────────
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

// ── GET /api/fuel-cards/:cardId/check-balance — query Goodi (debug mode) ─────
router.get('/:cardId/check-balance', requireAuth, async (req, res) => {
  const cardSn = req.params.cardId;
  const debug = {};

  // ════════════════════════════════════════════════════════════════════════════
  // ATTEMPT 1 — SOAP webservice
  // ════════════════════════════════════════════════════════════════════════════
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>\r\n<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="http://tempuri.org/">\r\n  <soap:Body>\r\n    <tns:GetCashCardsBySN>\r\n      <cardsn>${cardSn}</cardsn>\r\n    </tns:GetCashCardsBySN>\r\n  </soap:Body>\r\n</soap:Envelope>`;

  console.log(`\n[check-balance] ══ SOAP attempt ══ card=${cardSn}`);
  console.log(`[check-balance] SOAP body:\n${soapBody}`);

  try {
    const soapRes = await makeRequest({
      protocol: 'http:',
      hostname: 'www.goodi.co.il',
      port: 80,
      path: '/AdminFuel/WS/FuelWSAdm.asmx',
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"http://tempuri.org/GetCashCardsBySN"',
        'Content-Length': Buffer.byteLength(soapBody),
        'Host': 'www.goodi.co.il',
        'Accept': 'text/xml',
      },
    }, soapBody);

    console.log(`[check-balance] SOAP status: ${soapRes.status}`);
    console.log(`[check-balance] SOAP headers: ${JSON.stringify(soapRes.headers)}`);
    console.log(`[check-balance] SOAP body (first 2000 chars):\n${soapRes.body.slice(0, 2000)}`);

    debug.soap = {
      status: soapRes.status,
      headers: soapRes.headers,
      bodyPreview: soapRes.body.slice(0, 2000),
    };

    // Try to parse liters from SOAP response
    const literMatch = soapRes.body.match(/<total_x0020_liter_x0020_left[^>]*>([^<]+)<\/total_x0020_liter_x0020_left>/i);
    if (literMatch) {
      const liters = parseFloat(literMatch[1]);
      console.log(`[check-balance] SOAP ✅ liters found: ${liters}`);
      if (!isNaN(liters)) {
        return res.json({ liters, source: 'soap', debug });
      }
    }
    console.log(`[check-balance] SOAP — liters tag not found, trying WebForms...`);
  } catch (soapErr) {
    console.log(`[check-balance] SOAP error: ${soapErr.message}`);
    debug.soapError = soapErr.message;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ATTEMPT 2 — ASP.NET WebForms scrape
  // Step A: GET the page to collect cookies + hidden ASP.NET fields
  // Step B: POST the form with those fields
  // ════════════════════════════════════════════════════════════════════════════
  console.log(`\n[check-balance] ══ WebForms attempt ══ card=${cardSn}`);

  try {
    // Step A — GET page
    console.log(`[check-balance] GET https://fueladmin.goodi.co.il/_fuel/`);
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

    console.log(`[check-balance] GET status: ${getRes.status}`);
    console.log(`[check-balance] GET set-cookie: ${JSON.stringify(getRes.headers['set-cookie'])}`);

    debug.webforms_get = {
      status: getRes.status,
      setCookie: getRes.headers['set-cookie'],
    };

    // Extract hidden fields from HTML
    const extract = (html, name) => {
      const m = html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`, 'i'))
               || html.match(new RegExp(`id="${name}"[^>]*value="([^"]*)"`, 'i'));
      return m ? m[1] : null;
    };

    const viewstate    = extract(getRes.body, '__VIEWSTATE');
    const vsGenerator  = extract(getRes.body, '__VIEWSTATEGENERATOR');
    const eventVal     = extract(getRes.body, '__EVENTVALIDATION');
    const tssmVal      = extract(getRes.body, 'RadStyleSheetManager1_TSSM') || '';
    const tsmVal       = extract(getRes.body, 'RadScriptManager1_TSM') || '';

    console.log(`[check-balance] __VIEWSTATE length: ${viewstate ? viewstate.length : 'NOT FOUND'}`);
    console.log(`[check-balance] __VIEWSTATEGENERATOR: ${vsGenerator}`);
    console.log(`[check-balance] __EVENTVALIDATION length: ${eventVal ? eventVal.length : 'NOT FOUND'}`);

    // Collect cookies from GET response
    const cookies = (getRes.headers['set-cookie'] || [])
      .map((c) => c.split(';')[0])
      .join('; ');
    console.log(`[check-balance] Cookies: ${cookies}`);

    // Step B — POST form
    const formData = new URLSearchParams({
      RadStyleSheetManager1_TSSM: tssmVal,
      RadScriptManager1_TSM:      tsmVal,
      __VIEWSTATE:                 viewstate || '',
      __VIEWSTATEGENERATOR:        vsGenerator || '',
      __EVENTVALIDATION:           eventVal || '',
      ddSearchSelect:              '3',   // כרטיס קש
      tbSearch:                    cardSn,
      btnSearch:                   'חפש',
    }).toString();

    console.log(`[check-balance] POST body (params only, no state): ddSearchSelect=3&tbSearch=${cardSn}&btnSearch=חפש`);
    console.log(`[check-balance] POST full body length: ${formData.length}`);

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

    console.log(`[check-balance] POST status: ${postRes.status}`);
    console.log(`[check-balance] POST body (first 3000 chars):\n${postRes.body.slice(0, 3000)}`);

    debug.webforms_post = {
      status: postRes.status,
      bodyPreview: postRes.body.slice(0, 3000),
    };

    // Log full response body so we can see the full HTML structure
    console.log(`[check-balance] POST full body length: ${postRes.body.length}`);
    if (postRes.body.length > 3000) {
      console.log(`[check-balance] POST body continuation (3000-6000):\n${postRes.body.slice(3000, 6000)}`);
    }

    // Try common patterns for balance in response HTML
    const patterns = [
      /יתרה[^:]*:\s*([\d.]+)/,
      /liter[^>]*>\s*([\d.]+)/i,
      /total_liter_left[^>]*>\s*([\d.]+)/i,
      /(\d+(?:\.\d+)?)\s*ליטר/,
      /<td[^>]*>\s*([\d.]+)\s*<\/td>/g,
    ];

    let parsedLiters = null;
    for (const pat of patterns.slice(0, -1)) {
      const m = postRes.body.match(pat);
      if (m) {
        console.log(`[check-balance] Pattern "${pat}" matched: ${m[1]}`);
        parsedLiters = parseFloat(m[1]);
        break;
      }
    }

    // Log all table cells for analysis
    const tdMatches = [...postRes.body.matchAll(/<td[^>]*>([^<]{1,50})<\/td>/gi)]
      .map((m) => m[1].trim())
      .filter((v) => v.length > 0);
    console.log(`[check-balance] All <td> text values:`, tdMatches.join(' | '));
    debug.tdValues = tdMatches;

    if (parsedLiters !== null && !isNaN(parsedLiters)) {
      return res.json({ liters: parsedLiters, source: 'webforms', debug });
    }

    // Could not parse — return full debug so client can show it
    return res.status(422).json({ error: 'לא ניתן לנתח את התשובה מגודי', debug });

  } catch (wfErr) {
    console.log(`[check-balance] WebForms error: ${wfErr.message}`);
    debug.webformsError = wfErr.message;
    return res.status(502).json({ error: 'שגיאה בחיבור לאתר גודי', debug });
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
