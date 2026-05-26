// Headless Laguz boot — same services as the Electron app, no Electron.
//
// Sets up the per-app data directory under ~/.futhark/laguz so it doesn't
// collide with the Electron build's Application Support directory. Once the
// Tauri shell is the production runtime we can promote this to the canonical
// location and migrate data.

import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  configurePaths,
  config,
  VaultStore,
  SignatureStore,
  CabinetService,
  VaultWatcher,
  startApiServer,
  setCabinetService,
} from '@futhark/laguz/services';

const userData = path.join(os.homedir(), '.futhark', 'laguz');
fs.mkdirSync(userData, { recursive: true });

configurePaths({ userData });

// Allow a port override so the sidecar can run side-by-side with the Electron
// build during the migration. Drop this once Electron Laguz is retired.
const port = process.env.LAGUZ_API_PORT
  ? Number(process.env.LAGUZ_API_PORT)
  : config.apiPort;

console.log('[sidecar/laguz] user data:', userData);
console.log('[sidecar/laguz] vault:', config.vaultPath);
console.log('[sidecar/laguz] api port:', port);

async function main() {
  const store = new VaultStore();
  const signatureStore = new SignatureStore();
  const cabinetService = new CabinetService(store);
  cabinetService.ensureCabinetDir();
  setCabinetService(cabinetService);

  startApiServer(store, signatureStore, port);

  const watcher = new VaultWatcher(store);
  watcher.setCabinetService(cabinetService);
  await watcher.start();

  cabinetService.reprocessPending();

  console.log('[sidecar/laguz] ready on http://localhost:' + port);
}

main().catch((err) => {
  console.error('[sidecar/laguz] fatal:', err);
  process.exit(1);
});
