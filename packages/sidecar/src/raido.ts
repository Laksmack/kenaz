// Headless Raidō boot — same services as the Electron app, no Electron.

import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  configurePaths,
  ConfigStore,
  TaskStore,
  startApiServer,
} from '@futhark/raido/services';

const userData = path.join(os.homedir(), '.futhark', 'raido');
fs.mkdirSync(userData, { recursive: true });

configurePaths({ userData });

const port = process.env.RAIDO_API_PORT
  ? Number(process.env.RAIDO_API_PORT)
  : undefined;

console.log('[sidecar/raido] user data:', userData);

async function main() {
  const config = new ConfigStore();
  const store = new TaskStore();
  const effectivePort = port ?? config.get().apiPort;
  startApiServer(store, effectivePort, config);
  console.log('[sidecar/raido] ready on http://localhost:' + effectivePort);
}

main().catch((err) => {
  console.error('[sidecar/raido] fatal:', err);
  process.exit(1);
});
