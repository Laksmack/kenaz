// Public service-layer surface used by:
//   - Electron's main.ts (in-process)
//   - @futhark/sidecar (when running headless under Tauri or for dev)
//
// Keep this file Electron-free.

export { configurePaths } from './paths';
export { config } from './config';
export { VaultStore } from './vault-store';
export { SignatureStore } from './signature-store';
export { CabinetService } from './cabinet-service';
export { VaultWatcher } from './watcher';
export { startApiServer, setCabinetService } from './api-server';
export { LaguzConfigManager } from './laguz-config';
