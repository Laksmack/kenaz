// Public service-layer surface that is currently Electron-free at runtime.
//
// Re-exports only the leaves whose transitive dependency graph no longer
// pulls in 'electron'. As of phase 0 this is the storage + OAuth-config
// surface. The richer orchestrators (gmail, sync-engine, connectivity,
// account-manager) still pull electron through gmail's OAuth BrowserWindow
// and the sync/connectivity infrastructure — those will be split or
// migrated in phase 1+ when the Tauri system-browser OAuth flow lands.

export { configurePaths } from './paths';
export { GlobalConfigStore, AccountConfigStore, ConfigStore } from './config';
export { CacheStore } from './cache-store';
export { ViewStore, RuleStore } from './stores';
export { migrateToMultiAccount } from './migrate-accounts';
export {
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_REDIRECT_URI,
} from './oauth-config';
