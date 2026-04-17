/**
 * One-time script to obtain a Google OAuth2 refresh token.
 *
 * Run:  node scripts/getRefreshToken.js
 *
 * What it does:
 *   1. Starts a temporary Express server on port 3001
 *   2. Opens your browser to Google's OAuth2 consent screen
 *   3. Handles the /oauth/callback redirect
 *   4. Exchanges the auth code for tokens
 *   5. Prints the refresh token — copy it to GOOGLE_REFRESH_TOKEN in .env
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const { google } = require('googleapis');
const { exec } = require('child_process');

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI  = 'http://localhost:3001/oauth/callback';
const SCOPES        = ['https://www.googleapis.com/auth/drive'];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ERROR: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in server/.env');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',   // ensures a refresh_token is returned
  prompt: 'consent',        // forces consent screen even if previously granted
  scope: SCOPES,
});

const app = express();

app.get('/oauth/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    res.send(`<h2>Error: ${error}</h2>`);
    console.error('\nOAuth error:', error);
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    res.send(`
      <h2 style="font-family:monospace;color:green">✓ Success!</h2>
      <p style="font-family:monospace">Refresh token printed to your terminal. You can close this tab.</p>
    `);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  OAuth2 tokens received');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nRefresh token (copy this into server/.env as GOOGLE_REFRESH_TOKEN):');
    console.log('\n' + tokens.refresh_token + '\n');

    if (!tokens.refresh_token) {
      console.warn('WARNING: No refresh_token returned.');
      console.warn('This usually means this Google account already granted access.');
      console.warn('Go to https://myaccount.google.com/permissions, revoke CamDrive,');
      console.warn('then run this script again.\n');
    }

    process.exit(0);
  } catch (err) {
    res.send(`<h2>Token exchange failed: ${err.message}</h2>`);
    console.error('\nToken exchange error:', err.message);
    process.exit(1);
  }
});

const server = app.listen(3001, () => {
  console.log('\nOpening browser for Google OAuth2 consent…');
  console.log('If the browser does not open automatically, visit:\n');
  console.log(authUrl + '\n');

  // Open browser — works on macOS, Linux, and Windows
  const cmd = process.platform === 'win32'
    ? `start "" "${authUrl}"`
    : process.platform === 'darwin'
      ? `open "${authUrl}"`
      : `xdg-open "${authUrl}"`;

  exec(cmd, (err) => {
    if (err) console.warn('Could not open browser automatically:', err.message);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('\nERROR: Port 3001 is already in use.');
    console.error('Stop any running server on port 3001 and try again.\n');
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});
