// ── Bundled OAuth Credentials ──────────────────────────────────────────
// Loaded from .env file at project root.
//
// To set up:
// 1. Go to https://console.cloud.google.com/
// 2. Create a project → Enable Gmail API + Google Calendar API
// 3. OAuth consent screen → set to "External", add your scopes
// 4. Create OAuth 2.0 Client ID (Desktop app type)
// 5. Create a .env file in the project root with:
//    OAUTH_CLIENT_ID=your_client_id
//    OAUTH_CLIENT_SECRET=your_client_secret
//    OAUTH_REDIRECT_URI=http://localhost:8234

import dotenv from 'dotenv';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

// In production, .env is bundled next to the asar. In dev, it's at project root.
function loadEnv() {
  // Try multiple locations
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../../../.env'),
  ];

  // In packaged app, also check resources dir
  try {
    candidates.push(path.join(app.getAppPath(), '.env'));
    candidates.push(path.join(app.getPath('userData'), '.env'));
  } catch {
    // app may not be ready yet
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      return;
    }
  }
}

loadEnv();

export const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || '';
export const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || '';
export const OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || 'http://localhost:8234';
