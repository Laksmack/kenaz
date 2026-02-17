import dotenv from 'dotenv';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

function loadEnv() {
  const cwd = process.cwd();
  const candidates = [
    // Package root (cwd when running `electron .` from packages/dagaz/)
    path.join(cwd, '.env'),
    // Monorepo root (../../ from packages/dagaz/)
    path.join(cwd, '../../.env'),
    // Kenaz's .env (sibling package — same credentials)
    path.join(cwd, '../kenaz/.env'),
    // __dirname traversals (dist/main/main/ → package root → monorepo root)
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../../../.env'),
    path.join(__dirname, '../../../../.env'),
    path.join(__dirname, '../../../../../.env'),
  ];

  try {
    candidates.push(path.join(app.getAppPath(), '.env'));
    candidates.push(path.join(app.getPath('userData'), '.env'));
  } catch {
    // app may not be ready yet
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log('[Dagaz] Loaded .env from:', p);
      dotenv.config({ path: p });
      return;
    }
  }
  console.warn('[Dagaz] No .env file found! OAuth will not work.');
}

loadEnv();

export const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || '';
export const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || '';
export const OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || 'http://localhost:8234';

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];
