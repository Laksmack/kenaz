// Public service-layer surface that is currently Electron-free.
//
// Only re-exports modules whose dependency graph no longer transitively
// imports 'electron'. As of phase 0: config + cache-store + oauth constants.
// google-calendar, sync-engine, connectivity, dock-icon still pull electron
// (BrowserWindow OAuth window, powerMonitor, app.dock) and will be migrated
// or split as part of phase 1+ when the Tauri OAuth flow lands.

export { configurePaths } from './paths';
export { ConfigStore } from './config';
export { CacheStore } from './cache-store';
export {
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_REDIRECT_URI,
  CALENDAR_SCOPES,
} from './oauth-config';
