// Public service-layer surface. Electron-free at runtime: the few electron
// touchpoints (net.isOnline, powerMonitor, shell.openExternal) are behind
// guarded require('electron') calls that no-op under the sidecar (Node/Bun).

export { configurePaths } from './paths';
export { ConfigStore } from './config';
export { CacheStore } from './cache-store';
export { GoogleCalendarService } from './google-calendar';
export { CalendlyService } from './calendly';
export { ConnectivityMonitor } from './connectivity';
export { SyncEngine } from './sync-engine';
export { startApiServer } from './api-server';
export {
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_REDIRECT_URI,
  CALENDAR_SCOPES,
} from './oauth-config';
