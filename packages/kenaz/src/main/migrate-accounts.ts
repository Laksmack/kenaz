import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_URI } from './oauth-config';
import type { AccountInfo, GlobalConfig, AccountConfig } from '../shared/types';
import { DEFAULT_GLOBAL_CONFIG, DEFAULT_ACCOUNT_CONFIG } from '../shared/types';

/**
 * Migrate a single-account Kenaz installation to the multi-account layout.
 *
 * Old layout (flat):
 *   ~/Library/Application Support/kenaz/
 *     token.json, config.json, views.json, rules.json, kenaz-cache.db
 *
 * New layout:
 *   ~/Library/Application Support/kenaz/
 *     global-config.json
 *     accounts.json
 *     accounts/{email}/
 *       token.json, config.json, views.json, rules.json, kenaz-cache.db
 *
 * Returns true if migration was performed, false if not needed.
 */
export async function migrateToMultiAccount(): Promise<boolean> {
  const userData = app.getPath('userData');
  const accountsJsonPath = path.join(userData, 'accounts.json');
  const accountsDir = path.join(userData, 'accounts');

  // Already migrated: accounts.json exists
  if (fs.existsSync(accountsJsonPath)) {
    return false;
  }

  // Check for old-style token.json at root
  const oldTokenPath = path.join(userData, 'token.json');
  if (!fs.existsSync(oldTokenPath)) {
    return false;
  }

  console.log('[Migration] Detected single-account layout, migrating to multi-account...');

  // Determine the user's email from the token
  let email = '';
  try {
    const token = JSON.parse(fs.readFileSync(oldTokenPath, 'utf-8'));
    if (OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET) {
      const oauth2 = new OAuth2Client(OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_URI);
      oauth2.setCredentials(token);
      const gmail = google.gmail({ version: 'v1', auth: oauth2 });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      email = profile.data.emailAddress || '';
    }
  } catch (e) {
    console.error('[Migration] Could not determine email from token:', e);
  }

  // Fallback: use a placeholder if offline / token expired
  if (!email) {
    email = 'migrated-account';
    console.log('[Migration] Using placeholder email; will resolve on next auth check.');
  }

  // Create account directory
  const accountDir = path.join(accountsDir, email);
  if (!fs.existsSync(accountDir)) {
    fs.mkdirSync(accountDir, { recursive: true });
  }

  // Files to move into the account directory
  const filesToMove = [
    'token.json',
    'views.json',
    'rules.json',
    'kenaz-cache.db',
    'kenaz-cache.db-wal',
    'kenaz-cache.db-shm',
  ];

  for (const file of filesToMove) {
    const src = path.join(userData, file);
    const dst = path.join(accountDir, file);
    if (fs.existsSync(src)) {
      try {
        fs.copyFileSync(src, dst);
        fs.unlinkSync(src);
        console.log(`[Migration] Moved ${file} → accounts/${email}/${file}`);
      } catch (e) {
        console.error(`[Migration] Failed to move ${file}:`, e);
      }
    }
  }

  // Split config.json into global-config.json + per-account config.json
  const oldConfigPath = path.join(userData, 'config.json');
  if (fs.existsSync(oldConfigPath)) {
    try {
      const oldConfig = JSON.parse(fs.readFileSync(oldConfigPath, 'utf-8'));
      const globalKeys = new Set<string>(Object.keys(DEFAULT_GLOBAL_CONFIG));

      const globalConfig: Record<string, any> = {};
      const accountConfig: Record<string, any> = {};

      for (const [key, value] of Object.entries(oldConfig)) {
        if (globalKeys.has(key)) {
          globalConfig[key] = value;
        } else {
          accountConfig[key] = value;
        }
      }

      // Write global config
      fs.writeFileSync(
        path.join(userData, 'global-config.json'),
        JSON.stringify({ ...DEFAULT_GLOBAL_CONFIG, ...globalConfig }, null, 2)
      );

      // Write per-account config
      fs.writeFileSync(
        path.join(accountDir, 'config.json'),
        JSON.stringify({ ...DEFAULT_ACCOUNT_CONFIG, ...accountConfig }, null, 2)
      );

      // Remove old config.json
      fs.unlinkSync(oldConfigPath);
      console.log('[Migration] Split config.json → global-config.json + accounts/…/config.json');
    } catch (e) {
      console.error('[Migration] Failed to split config.json:', e);
    }
  }

  // Write accounts.json
  const now = new Date().toISOString();
  const accounts: AccountInfo[] = [{ email, addedAt: now, lastActive: now }];
  fs.writeFileSync(accountsJsonPath, JSON.stringify(accounts, null, 2));
  console.log(`[Migration] Created accounts.json with account: ${email}`);

  return true;
}
