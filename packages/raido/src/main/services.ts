// Public service-layer surface used by:
//   - Electron's main.ts (in-process)
//   - @futhark/sidecar (when running headless under Tauri or for dev)
//
// Keep this file Electron-free.

export { configurePaths } from './paths';
export { ConfigStore } from './config';
export { TaskStore } from './task-store';
export { LinearService } from './linear';
export { startApiServer } from './api-server';
