const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

let adminHash = null;
let teamHash = null;

/**
 * Called once at server startup. Hashes both passwords from env vars so
 * all subsequent comparisons use bcrypt (constant-time, no plain-text in memory).
 */
async function initPasswordHashes() {
  if (!process.env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD env var is required');
  if (!process.env.TEAM_PASSWORD)  throw new Error('TEAM_PASSWORD env var is required');

  [adminHash, teamHash] = await Promise.all([
    bcrypt.hash(process.env.ADMIN_PASSWORD, SALT_ROUNDS),
    bcrypt.hash(process.env.TEAM_PASSWORD,  SALT_ROUNDS),
  ]);
}

async function verifyAdminPassword(plain) {
  if (!adminHash) return false;
  return bcrypt.compare(plain, adminHash);
}

async function verifyTeamPassword(plain) {
  if (!teamHash) return false;
  return bcrypt.compare(plain, teamHash);
}

module.exports = { initPasswordHashes, verifyAdminPassword, verifyTeamPassword };
