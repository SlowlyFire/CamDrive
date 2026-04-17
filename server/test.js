/**
 * CamDrive end-to-end test suite
 * Spawns the server, runs every endpoint, cleans up Drive folders, reports results.
 *
 * Run: node test.js
 */

'use strict';

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '.env') });

// Import Drive helpers directly so the test can create/delete Drive folders
const {
  getDriveClient,
  createFolder,
  deleteFile,
  listRootFolders,
  determineNextLetter,
  indexToLetter,
  isLegacyFolder,
  isEnlistmentFolder,
  isReleaseFolder,
  formatDate,
} = require('./services/driveService');

const DRIVE_ROOT = process.env.DRIVE_ROOT_FOLDER_ID;

// ── Minimal valid 1×1 JPEG (white pixel) ─────────────────────────────────
// prettier-ignore
const TINY_JPEG = Buffer.from([
  0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,
  0x00,0x01,0x00,0x00,0xff,0xdb,0x00,0x43,0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,
  0x07,0x07,0x07,0x09,0x09,0x08,0x0a,0x0c,0x14,0x0d,0x0c,0x0b,0x0b,0x0c,0x19,0x12,
  0x13,0x0f,0x14,0x1d,0x1a,0x1f,0x1e,0x1d,0x1a,0x1c,0x1c,0x20,0x24,0x2e,0x27,0x20,
  0x22,0x2c,0x23,0x1c,0x1c,0x28,0x37,0x29,0x2c,0x30,0x31,0x34,0x34,0x34,0x1f,0x27,
  0x39,0x3d,0x38,0x32,0x3c,0x2e,0x33,0x34,0x32,0xff,0xc0,0x00,0x0b,0x08,0x00,0x01,
  0x00,0x01,0x01,0x01,0x11,0x00,0xff,0xc4,0x00,0x1f,0x00,0x00,0x01,0x05,0x01,0x01,
  0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,
  0x05,0x06,0x07,0x08,0x09,0x0a,0x0b,0xff,0xc4,0x00,0xb5,0x10,0x00,0x02,0x01,0x03,
  0x03,0x02,0x04,0x03,0x05,0x05,0x04,0x04,0x00,0x00,0x01,0x7d,0x01,0x02,0x03,0x00,
  0x04,0x11,0x05,0x12,0x21,0x31,0x41,0x06,0x13,0x51,0x61,0x07,0x22,0x71,0x14,0x32,
  0x81,0x91,0xa1,0x08,0x23,0x42,0xb1,0xc1,0x15,0x52,0xd1,0xf0,0x24,0x33,0x62,0x72,
  0x82,0x09,0x0a,0x16,0x17,0x18,0x19,0x1a,0x25,0x26,0x27,0x28,0x29,0x2a,0x34,0x35,
  0x36,0x37,0x38,0x39,0x3a,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4a,0x53,0x54,0x55,
  0x56,0x57,0x58,0x59,0x5a,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6a,0x73,0x74,0x75,
  0x76,0x77,0x78,0x79,0x7a,0x83,0x84,0x85,0x86,0x87,0x88,0x89,0x8a,0x92,0x93,0x94,
  0x95,0x96,0x97,0x98,0x99,0x9a,0xa2,0xa3,0xa4,0xa5,0xa6,0xa7,0xa8,0xa9,0xaa,0xb2,
  0xb3,0xb4,0xb5,0xb6,0xb7,0xb8,0xb9,0xba,0xc2,0xc3,0xc4,0xc5,0xc6,0xc7,0xc8,0xc9,
  0xca,0xd2,0xd3,0xd4,0xd5,0xd6,0xd7,0xd8,0xd9,0xda,0xe1,0xe2,0xe3,0xe4,0xe5,0xe6,
  0xe7,0xe8,0xe9,0xea,0xf1,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,0xf9,0xfa,0xff,0xda,
  0x00,0x08,0x01,0x01,0x00,0x00,0x3f,0x00,0xfb,0xd2,0x8a,0x28,0x03,0xff,0xd9,
]);

// ── Free port ─────────────────────────────────────────────────────────────
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ── Shared state ──────────────────────────────────────────────────────────
let BASE = '';
let JWT = '';
let personId = '';
let personId2 = '';

// Test plates — unique per run so parallel runs don't clash
const TS = Date.now().toString().slice(-6);
const PLATE_MULTI  = `TST${TS}M`;  // used for multi-inspection letter tests
const PLATE_LEGACY = `TST${TS}L`;  // used for legacy detection test
const PLATE_REJECT = `TST${TS}R`;  // used for rejection test

// Drive folder IDs to clean up at the end
const driveFolderIdsToDelete = [];

// ── Test runner ───────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    passed++;
    process.stdout.write(`  ✓  ${name}\n`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    failed++;
    process.stdout.write(`  ✗  ${name}\n     → ${err.message}\n`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

async function api(method, url, { body, jwt, form } = {}) {
  const headers = {};
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
  let reqBody;
  if (form) {
    reqBody = form;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    reqBody = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${url}`, { method, headers, body: reqBody });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.arrayBuffer();
  return { status: res.status, data, headers: res.headers };
}

function makeInspectionForm(meta, photoCount = 2) {
  const form = new FormData();
  form.append('data', JSON.stringify(meta));
  for (let i = 0; i < photoCount; i++) {
    form.append('photos', new Blob([TINY_JPEG], { type: 'image/jpeg' }), `photo-${i + 1}.jpg`);
  }
  return form;
}

/** Approve an inspection and return the API response data */
async function approveInspection(id) {
  const { status, data } = await api('POST', `/inspections/${id}/approve`, { jwt: JWT });
  return { status, data };
}

/** Check upload results — warn on quota error, hard-fail on other errors */
function checkUploadResults(uploadResults) {
  const failures = uploadResults.filter((r) => !r.success);
  if (failures.length === 0) {
    console.log(`     → Photos uploaded to Drive successfully`);
    return;
  }
  const isQuota = failures.some(
    (r) => r.error && (r.error.includes('storage quota') || r.error.includes('SharedDrives'))
  );
  if (isQuota) {
    console.log(`     ⚠  Storage quota issue (needs Shared Drive) — folder created, files not uploaded`);
  } else {
    throw new Error(`Photo upload failures: ${JSON.stringify(failures)}`);
  }
}

// ── Pure unit tests (no server needed) ───────────────────────────────────

function runUnitTests() {
  console.log('\n[ Unit: indexToLetter ]');

  const cases = [
    [0, 'A'], [1, 'B'], [25, 'Z'], [26, 'AA'], [27, 'AB'], [51, 'AZ'], [52, 'BA'],
  ];
  for (const [n, expected] of cases) {
    const got = indexToLetter(n);
    if (got !== expected) {
      throw new Error(`indexToLetter(${n}): expected ${expected}, got ${got}`);
    }
  }
  process.stdout.write(`  ✓  indexToLetter: A/B/Z/AA/AB/AZ/BA all correct\n`);
  passed++;
  results.push({ name: 'indexToLetter', ok: true });

  console.log('\n[ Unit: folder classification ]');

  const plate = '181900';
  const legacyCases = [
    ['181900', true],
    ['181900-A', true],
    ['A 181900', true],
    ['A-181900', true],
    ['A - 181900', true],
    [`גיוס 181900-A 12.07.25`, false],
    [`שחרור 181900-A 15.08.25`, false],
    ['999999', false],
  ];
  for (const [name, expected] of legacyCases) {
    const got = isLegacyFolder(name, plate);
    if (got !== expected) {
      throw new Error(`isLegacyFolder("${name}", "${plate}"): expected ${expected}, got ${got}`);
    }
  }
  process.stdout.write(`  ✓  isLegacyFolder: all cases correct\n`);
  passed++;
  results.push({ name: 'isLegacyFolder', ok: true });

  console.log('\n[ Unit: determineNextLetter ]');

  const folders = [
    { name: '181900' },               // legacy → counts as enlistment
    { name: '181900-A' },             // legacy → counts as enlistment
    { name: `גיוס 181900-C 01.01.25` }, // existing enlistment
    { name: `שחרור 181900-A 02.01.25` }, // existing release
    { name: `שחרור 181900-B 03.01.25` }, // existing release
  ];
  // Enlistment: 2 legacy + 1 existing = index 3 → D
  const enlistLetter = determineNextLetter('181900', 'enlistment', folders);
  assert(enlistLetter === 'D', `enlistment letter: expected D, got ${enlistLetter}`);
  // Release: 2 existing = index 2 → C
  const releaseLetter = determineNextLetter('181900', 'release', folders);
  assert(releaseLetter === 'C', `release letter: expected C, got ${releaseLetter}`);
  process.stdout.write(`  ✓  determineNextLetter: enlistment=D, release=C (correct)\n`);
  passed++;
  results.push({ name: 'determineNextLetter', ok: true });

  // Fresh plate: no folders → A
  const freshEnlist = determineNextLetter('999999', 'enlistment', folders);
  const freshRelease = determineNextLetter('999999', 'release', folders);
  assert(freshEnlist === 'A', `fresh enlistment: expected A, got ${freshEnlist}`);
  assert(freshRelease === 'A', `fresh release: expected A, got ${freshRelease}`);
  process.stdout.write(`  ✓  determineNextLetter: fresh plate → A for both types\n`);
  passed++;
  results.push({ name: 'determineNextLetter fresh', ok: true });
}

// ── Main test suite (requires running server) ─────────────────────────────

async function runTests() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  CamDrive API — End-to-End Test Suite');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  runUnitTests();

  // ── Health ──────────────────────────────────────────────────────────────
  console.log('\n[ Health ]');
  await test('GET /health → 200', async () => {
    const { status, data } = await api('GET', '/health');
    assert(status === 200);
    assert(data.status === 'ok');
  });

  // ── Auth ────────────────────────────────────────────────────────────────
  console.log('\n[ Auth ]');
  await test('POST /auth/login wrong password → 401', async () => {
    const { status } = await api('POST', '/auth/login', { body: { password: 'wrong' } });
    assert(status === 401, `got ${status}`);
  });
  await test('POST /auth/login correct password → JWT', async () => {
    const { status, data } = await api('POST', '/auth/login', { body: { password: '2701' } });
    assert(status === 200, `got ${status}`);
    assert(typeof data.token === 'string' && data.token.length > 10);
    JWT = data.token;
  });

  // ── People ──────────────────────────────────────────────────────────────
  console.log('\n[ People ]');
  await test('GET /people (public) → array', async () => {
    const { status, data } = await api('GET', '/people');
    assert(status === 200);
    assert(Array.isArray(data));
  });
  await test('POST /people without auth → 401', async () => {
    const { status } = await api('POST', '/people', { body: { name: 'אלמוני' } });
    assert(status === 401);
  });
  await test('POST /people → creates שון', async () => {
    const { status, data } = await api('POST', '/people', { body: { name: 'שון-טסט' }, jwt: JWT });
    assert(status === 201, `got ${status}: ${JSON.stringify(data)}`);
    personId = data._id;
  });
  await test('POST /people → creates ריקי', async () => {
    const { status, data } = await api('POST', '/people', { body: { name: 'ריקי-טסט' }, jwt: JWT });
    assert(status === 201, `got ${status}`);
    personId2 = data._id;
  });
  await test('POST /people empty name → 400', async () => {
    const { status } = await api('POST', '/people', { body: { name: '  ' }, jwt: JWT });
    assert(status === 400);
  });
  await test('GET /people includes new person', async () => {
    const { data } = await api('GET', '/people');
    assert(data.find((p) => p._id === personId), 'person not found');
  });

  // ── Create inspections ──────────────────────────────────────────────────
  console.log('\n[ Inspections — Create ]');

  // inspections for multi-letter test (plate PLATE_MULTI)
  let inspIdEnlistA, inspIdReleaseA, inspIdEnlistB;
  await test('POST /inspections enlistment #1 (PLATE_MULTI) → 201', async () => {
    const form = makeInspectionForm({ licensePlate: PLATE_MULTI, type: 'enlistment',
      members: ['שון-טסט'], location: 'בסיס', vehicleHours: 100, notes: '' });
    const { status, data } = await api('POST', '/inspections', { form });
    assert(status === 201, `got ${status}: ${JSON.stringify(data)}`);
    inspIdEnlistA = data._id;
  });
  await test('POST /inspections release #1 (PLATE_MULTI) → 201', async () => {
    const form = makeInspectionForm({ licensePlate: PLATE_MULTI, type: 'release',
      members: ['שון-טסט'], location: 'בסיס', vehicleHours: 200, notes: '' });
    const { status, data } = await api('POST', '/inspections', { form });
    assert(status === 201, `got ${status}`);
    inspIdReleaseA = data._id;
  });
  await test('POST /inspections enlistment #2 (PLATE_MULTI) → 201', async () => {
    const form = makeInspectionForm({ licensePlate: PLATE_MULTI, type: 'enlistment',
      members: ['ריקי-טסט'], location: 'דרום', vehicleHours: 300, notes: '' });
    const { status, data } = await api('POST', '/inspections', { form });
    assert(status === 201, `got ${status}`);
    inspIdEnlistB = data._id;
  });

  // inspection for rejection test
  let inspIdReject;
  await test('POST /inspections (PLATE_REJECT) → 201', async () => {
    const form = makeInspectionForm({ licensePlate: PLATE_REJECT, type: 'release',
      members: ['שון-טסט'], location: 'מחסן', vehicleHours: 50, notes: '' }, 1);
    const { status, data } = await api('POST', '/inspections', { form });
    assert(status === 201, `got ${status}`);
    inspIdReject = data._id;
  });

  await test('POST /inspections missing licensePlate → 400', async () => {
    const form = makeInspectionForm({ type: 'enlistment' }, 0);
    const { status } = await api('POST', '/inspections', { form });
    assert(status === 400);
  });

  // ── List & fetch ────────────────────────────────────────────────────────
  console.log('\n[ Inspections — List & Fetch ]');
  await test('GET /inspections/pending (auth) → has our inspections', async () => {
    const { status, data } = await api('GET', '/inspections/pending', { jwt: JWT });
    assert(status === 200);
    assert(data.find((i) => i._id === inspIdEnlistA), 'missing enlistA');
  });
  await test('GET /inspections/pending without auth → 401', async () => {
    const { status } = await api('GET', '/inspections/pending');
    assert(status === 401);
  });
  await test('GET /inspections/:id → full inspection', async () => {
    const { status, data } = await api('GET', `/inspections/${inspIdEnlistA}`);
    assert(status === 200);
    assert(data.photos.length === 2, `expected 2 photos, got ${data.photos.length}`);
  });
  await test('GET /inspections/my/:name → list for member', async () => {
    const { data } = await api('GET', `/inspections/my/${encodeURIComponent('שון-טסט')}`);
    assert(data.find((i) => i._id === inspIdEnlistA), 'inspection not found for member');
  });

  // ── Share link ──────────────────────────────────────────────────────────
  console.log('\n[ Share Link ]');
  let shareToken;
  await test('GET /inspections/:id → has shareToken', async () => {
    const { data } = await api('GET', `/inspections/${inspIdEnlistA}`);
    assert(data.shareToken, 'missing shareToken');
    shareToken = data.shareToken;
  });
  await test('GET /inspections/share/:token → public view', async () => {
    const { status, data } = await api('GET', `/inspections/share/${shareToken}`);
    assert(status === 200);
    assert(data.licensePlate === PLATE_MULTI);
  });
  await test('GET /inspections/share/bad-token → 404', async () => {
    const { status } = await api('GET', '/inspections/share/nonexistent-xyz');
    assert(status === 404);
  });

  // ── Photo management ────────────────────────────────────────────────────
  console.log('\n[ Photo Management ]');
  let addedFilename;
  await test('PUT /inspections/:id/photos → adds photo (count 2→3)', async () => {
    const form = new FormData();
    form.append('photos', new Blob([TINY_JPEG], { type: 'image/jpeg' }), 'extra.jpg');
    const { status, data } = await api('PUT', `/inspections/${inspIdEnlistA}/photos`, { form });
    assert(status === 200, `got ${status}: ${JSON.stringify(data)}`);
    assert(data.photos.length === 3, `expected 3, got ${data.photos.length}`);
    addedFilename = data.photos[2].filename;
  });
  await test('DELETE /inspections/:id/photos/:filename → count back to 2', async () => {
    const { status } = await api('DELETE', `/inspections/${inspIdEnlistA}/photos/${addedFilename}`);
    assert(status === 200);
    const { data } = await api('GET', `/inspections/${inspIdEnlistA}`);
    assert(data.photos.length === 2, `expected 2, got ${data.photos.length}`);
  });

  // ── ZIP download ────────────────────────────────────────────────────────
  console.log('\n[ ZIP Download ]');
  await test('GET /inspections/:id/download-zip → ZIP content-type', async () => {
    const { status, headers } = await api('GET', `/inspections/${inspIdEnlistA}/download-zip`);
    assert(status === 200, `got ${status}`);
    assert((headers.get('content-type') || '').includes('zip'));
  });

  // ── Rejection ───────────────────────────────────────────────────────────
  console.log('\n[ Rejection ]');
  await test('POST /inspections/:id/reject without auth → 401', async () => {
    const { status } = await api('POST', `/inspections/${inspIdReject}/reject`, { body: { reason: 'x' } });
    assert(status === 401);
  });
  await test('POST /inspections/:id/reject (auth) → rejected', async () => {
    const { status, data } = await api('POST', `/inspections/${inspIdReject}/reject`,
      { body: { reason: 'תמונות לא ברורות' }, jwt: JWT });
    assert(status === 200, `got ${status}: ${JSON.stringify(data)}`);
    assert(data.inspection.status === 'rejected');
    assert(data.inspection.rejectionReason === 'תמונות לא ברורות');
  });
  await test('POST /inspections/:id/reject again → 400', async () => {
    const { status } = await api('POST', `/inspections/${inspIdReject}/reject`,
      { body: { reason: 'x' }, jwt: JWT });
    assert(status === 400);
  });
  await test('Rejected not in pending list', async () => {
    const { data } = await api('GET', '/inspections/pending', { jwt: JWT });
    assert(!data.find((i) => i._id === inspIdReject), 'still in pending');
  });
  await test('PUT photos on rejected → 400', async () => {
    const form = new FormData();
    form.append('photos', new Blob([TINY_JPEG], { type: 'image/jpeg' }), 'x.jpg');
    const { status } = await api('PUT', `/inspections/${inspIdReject}/photos`, { form });
    assert(status === 400);
  });

  // ── Drive folder logic ──────────────────────────────────────────────────
  console.log('\n[ Drive Folder Logic ]');

  const today = formatDate(new Date());

  // ── Test A: first enlistment → letter A ──────────────────────────────
  let folderNameEnlistA;
  await test(`Approve enlistment #1 → folder "גיוס ${PLATE_MULTI}-A ${today}"`, async () => {
    const { status, data } = await approveInspection(inspIdEnlistA);
    assert(status === 200, `got ${status}: ${JSON.stringify(data)}`);
    assert(data.success);
    assert(data.letter === 'A', `expected letter A, got ${data.letter}`);
    const expected = `גיוס ${PLATE_MULTI}-A ${today}`;
    assert(data.driveFolderName === expected,
      `expected "${expected}", got "${data.driveFolderName}"`);
    folderNameEnlistA = data.driveFolderName;
    driveFolderIdsToDelete.push(data.driveFolderId);
    console.log(`     → Created: "${data.driveFolderName}" (${data.driveFolderId})`);
    checkUploadResults(data.uploadResults);
  });

  // ── Test B: first release for same plate → independent letter A ───────
  let folderNameReleaseA;
  await test(`Approve release #1 → folder "שחרור ${PLATE_MULTI}-A ${today}"`, async () => {
    const { status, data } = await approveInspection(inspIdReleaseA);
    assert(status === 200, `got ${status}: ${JSON.stringify(data)}`);
    assert(data.letter === 'A', `expected letter A, got ${data.letter}`);
    const expected = `שחרור ${PLATE_MULTI}-A ${today}`;
    assert(data.driveFolderName === expected,
      `expected "${expected}", got "${data.driveFolderName}"`);
    folderNameReleaseA = data.driveFolderName;
    driveFolderIdsToDelete.push(data.driveFolderId);
    console.log(`     → Created: "${data.driveFolderName}" (${data.driveFolderId})`);
    checkUploadResults(data.uploadResults);
  });

  // ── Test C: second enlistment same plate → letter B ───────────────────
  await test(`Approve enlistment #2 → folder "גיוס ${PLATE_MULTI}-B ${today}"`, async () => {
    const { status, data } = await approveInspection(inspIdEnlistB);
    assert(status === 200, `got ${status}: ${JSON.stringify(data)}`);
    assert(data.letter === 'B', `expected letter B, got ${data.letter}`);
    const expected = `גיוס ${PLATE_MULTI}-B ${today}`;
    assert(data.driveFolderName === expected,
      `expected "${expected}", got "${data.driveFolderName}"`);
    driveFolderIdsToDelete.push(data.driveFolderId);
    console.log(`     → Created: "${data.driveFolderName}" (${data.driveFolderId})`);
    checkUploadResults(data.uploadResults);
  });

  // ── Test D: legacy folder detection ───────────────────────────────────
  console.log('\n[ Legacy Folder Detection ]');

  // Create a legacy-named folder in Drive root (simulates pre-existing vehicle)
  let legacyFolderId;
  await test(`Create legacy folder "${PLATE_LEGACY}" in Drive root`, async () => {
    const { id } = await createFolder(PLATE_LEGACY, DRIVE_ROOT);
    legacyFolderId = id;
    driveFolderIdsToDelete.push(id);
    console.log(`     → Legacy folder created: "${PLATE_LEGACY}" (${id})`);
  });

  let inspIdLegacyEnlist;
  await test('POST /inspections for PLATE_LEGACY enlistment → 201', async () => {
    const form = makeInspectionForm({ licensePlate: PLATE_LEGACY, type: 'enlistment',
      members: ['שון-טסט'], location: 'מרכז', vehicleHours: 10, notes: '' }, 1);
    const { status, data } = await api('POST', '/inspections', { form });
    assert(status === 201, `got ${status}`);
    inspIdLegacyEnlist = data._id;
  });

  await test(`Legacy folder counts as A → approval creates "גיוס ${PLATE_LEGACY}-B ${today}"`, async () => {
    const { status, data } = await approveInspection(inspIdLegacyEnlist);
    assert(status === 200, `got ${status}: ${JSON.stringify(data)}`);
    assert(data.letter === 'B',
      `expected B (legacy folder counts as A), got ${data.letter}`);
    const expected = `גיוס ${PLATE_LEGACY}-B ${today}`;
    assert(data.driveFolderName === expected,
      `expected "${expected}", got "${data.driveFolderName}"`);
    driveFolderIdsToDelete.push(data.driveFolderId);
    console.log(`     → Created: "${data.driveFolderName}" (${data.driveFolderId})`);
    checkUploadResults(data.uploadResults);
  });

  // ── Drive: can't approve twice ─────────────────────────────────────────
  await test('POST /inspections/:id/approve again → 400', async () => {
    const { status } = await approveInspection(inspIdEnlistA);
    assert(status === 400);
  });

  // ── Vehicle history ─────────────────────────────────────────────────────
  console.log('\n[ Vehicle History ]');
  await test('GET /vehicle/:plate → vehicle with driveFolders', async () => {
    const { status, data } = await api('GET', `/vehicle/${PLATE_MULTI}`);
    assert(status === 200, `got ${status}`);
    assert(data.vehicle !== null, 'vehicle should exist');
    assert(data.vehicle.driveFolders.length === 3,
      `expected 3 driveFolders, got ${data.vehicle.driveFolders.length}`);
    const types = data.vehicle.driveFolders.map((f) => f.type);
    assert(types.filter((t) => t === 'enlistment').length === 2, 'expected 2 enlistments');
    assert(types.filter((t) => t === 'release').length === 1, 'expected 1 release');
    const names = data.vehicle.driveFolders.map((f) => f.folderName);
    console.log(`     → driveFolders: ${JSON.stringify(names)}`);
  });
  await test('GET /vehicle/:plate → inspections history', async () => {
    const { data } = await api('GET', `/vehicle/${PLATE_MULTI}`);
    assert(Array.isArray(data.inspections));
    assert(data.inspections.find((i) => i._id === inspIdEnlistA), 'enlistA not in history');
  });
  await test('GET /vehicles → contains test vehicle', async () => {
    const { status, data } = await api('GET', '/vehicles');
    assert(status === 200);
    assert(data.find((v) => v.licensePlate === PLATE_MULTI), 'vehicle not in list');
  });
  await test('Local upload dirs deleted after approval', () => {
    for (const id of [inspIdEnlistA, inspIdReleaseA, inspIdEnlistB, inspIdLegacyEnlist]) {
      const dir = path.join(__dirname, 'uploads', id);
      assert(!fs.existsSync(dir), `dir should be deleted: ${dir}`);
    }
  });

  // ── Stats ───────────────────────────────────────────────────────────────
  console.log('\n[ Stats ]');
  await test('GET /stats without auth → 401', async () => {
    const { status } = await api('GET', '/stats');
    assert(status === 401);
  });
  await test('GET /stats (auth) → correct shape', async () => {
    const { status, data } = await api('GET', '/stats', { jwt: JWT });
    assert(status === 200);
    assert(typeof data.pendingCount === 'number');
    assert(typeof data.totalThisWeek === 'number');
    assert(typeof data.vehicleCount === 'number');
    assert(typeof data.memberCounts === 'object');
    console.log(`     → pending: ${data.pendingCount}, vehicles: ${data.vehicleCount}`);
  });

  // ── Cleanup: people ─────────────────────────────────────────────────────
  console.log('\n[ Cleanup ]');
  await test('DELETE /people/:id → soft-deleted', async () => {
    const { status } = await api('DELETE', `/people/${personId}`, { jwt: JWT });
    assert(status === 200);
  });
  await test('DELETE /people/:id2 → soft-deleted', async () => {
    const { status } = await api('DELETE', `/people/${personId2}`, { jwt: JWT });
    assert(status === 200);
  });
  await test('Deleted people not in GET /people', async () => {
    const { data } = await api('GET', '/people');
    assert(!data.find((p) => p._id === personId));
    assert(!data.find((p) => p._id === personId2));
  });
}

// ── Cleanup Drive folders ──────────────────────────────────────────────────
async function cleanupDrive() {
  if (driveFolderIdsToDelete.length === 0) return;
  console.log(`\nCleaning up ${driveFolderIdsToDelete.length} Drive folder(s)…`);
  for (const id of driveFolderIdsToDelete) {
    try {
      await deleteFile(id);
      console.log(`  deleted ${id}`);
    } catch (err) {
      console.log(`  could not delete ${id}: ${err.message}`);
    }
  }
}

// ── Server lifecycle ──────────────────────────────────────────────────────
function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['index.js'], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Server start timeout')); }, 35_000);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      process.stdout.write(`[server] ${chunk}`);
      if (output.includes('running on port')) { clearTimeout(timeout); resolve(child); }
    });
    child.stderr.on('data', (chunk) => process.stderr.write(`[server ERR] ${chunk}`));
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) { clearTimeout(timeout); reject(new Error(`Server exit ${code}`)); }
    });
  });
}

(async () => {
  const port = await getFreePort();
  BASE = `http://localhost:${port}/api`;
  console.log(`\nStarting server on port ${port}…`);

  let server;
  try {
    server = await startServer(port);
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 300));

  try {
    await runTests();
  } finally {
    server.kill();
    await cleanupDrive();
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (failed > 0) {
    console.log('Failed tests:');
    results.filter((r) => !r.ok).forEach((r) => console.log(`  ✗  ${r.name}\n     ${r.error}`));
    process.exit(1);
  }
})();
