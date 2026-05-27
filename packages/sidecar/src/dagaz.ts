// Headless Dagaz boot — same services as the Electron app, no Electron.
//
// OAuth uses the loopback flow (local server on :8234 + system-browser open),
// which already works outside Electron, so Dagaz can run fully headless.

import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  configurePaths,
  ConfigStore,
  CacheStore,
  GoogleCalendarService,
  CalendlyService,
  ConnectivityMonitor,
  SyncEngine,
  startApiServer,
} from '@futhark/dagaz/services';

const userData = path.join(os.homedir(), '.futhark', 'dagaz');
fs.mkdirSync(userData, { recursive: true });

configurePaths({ userData });

const port = process.env.DAGAZ_API_PORT
  ? Number(process.env.DAGAZ_API_PORT)
  : 3143;

console.log('[sidecar/dagaz] user data:', userData);

async function main() {
  const config = new ConfigStore();
  const cache = new CacheStore();
  const google = new GoogleCalendarService();
  const calendly = new CalendlyService();
  const connectivity = new ConnectivityMonitor();
  connectivity.start();
  const sync = new SyncEngine(google, cache, connectivity);

  const appConfig = config.get();
  if (appConfig.calendlyApiKey) {
    calendly.configure(appConfig.calendlyApiKey);
  }

  startApiServer(cache, google, sync, connectivity, port, calendly);

  if (google.isAuthorized()) {
    sync.start();
    console.log('[sidecar/dagaz] google authorized — sync started');
  } else {
    console.log('[sidecar/dagaz] google NOT authorized — call /api auth to connect');
  }

  console.log('[sidecar/dagaz] ready on http://localhost:' + port);
}

main().catch((err) => {
  console.error('[sidecar/dagaz] fatal:', err);
  process.exit(1);
});
