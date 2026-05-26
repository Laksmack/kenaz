import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { userDataDir } from './paths';

function loadEnv() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, '.env') : '',
    path.join(__dirname, '../../../.env'),
    path.join(__dirname, '../../.env'),
    path.join(process.cwd(), '.env'),
  ];

  // Electron-only candidate: the bundled .env inside the .asar.
  // require('electron') in plain Node returns a string (the binary path), so
  // accessing `.app` throws — caught silently so the sidecar / tests work too.
  try {
    const electronApp = require('electron').app;
    if (electronApp?.getAppPath) {
      candidates.push(path.join(electronApp.getAppPath(), '.env'));
    }
  } catch {
    // not running under Electron, or app isn't ready
  }

  try {
    candidates.push(path.join(userDataDir(), '.env'));
  } catch {
    // paths not configured (e.g. sidecar imported this before bootstrap)
  }

  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      console.log('[Kenaz] Loaded .env from:', p);
      dotenv.config({ path: p });
      return;
    }
  }
  console.warn('[Kenaz] No .env found — OAuth will not work. Searched:', candidates.filter(Boolean));
}

loadEnv();

export const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || '';
export const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || '';
export const OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || 'http://localhost:8234';
