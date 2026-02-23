import dotenv from 'dotenv';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

function loadEnv() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, '.env') : '',
    path.join(__dirname, '../../../.env'),
    path.join(__dirname, '../../.env'),
    path.join(process.cwd(), '.env'),
  ];

  try {
    candidates.push(path.join(app.getAppPath(), '.env'));
    candidates.push(path.join(app.getPath('userData'), '.env'));
  } catch {
    // app may not be ready yet
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
