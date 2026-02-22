import { autoUpdater, type UpdateInfo } from 'electron-updater';
import { ipcMain, type BrowserWindow } from 'electron';

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string };

let updateState: UpdateState = { status: 'idle' };
let win: BrowserWindow | null = null;
let rebuildMenuFn: (() => void) | null = null;
let checkInterval: ReturnType<typeof setInterval> | null = null;

export function getUpdateState(): UpdateState {
  return updateState;
}

function setState(state: UpdateState) {
  updateState = state;
  win?.webContents.send('update:state', state);
  rebuildMenuFn?.();
}

export function initAutoUpdater(
  mainWindow: BrowserWindow,
  rebuildMenu: () => void,
) {
  win = mainWindow;
  rebuildMenuFn = rebuildMenu;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => {
    setState({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    setState({ status: 'available', version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    setState({ status: 'downloading', percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    setState({ status: 'ready', version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    setState({ status: 'idle' });
  });

  autoUpdater.on('error', (err) => {
    console.error('[auto-updater]', err.message);
    setState({ status: 'error', message: err.message });
    setTimeout(() => setState({ status: 'idle' }), 10_000);
  });

  ipcMain.handle('update:check', () => autoUpdater.checkForUpdates());
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());

  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5_000);
  checkInterval = setInterval(
    () => autoUpdater.checkForUpdates().catch(() => {}),
    30 * 60 * 1000,
  );
}

export function getUpdateMenuItems(): Electron.MenuItemConstructorOptions[] {
  switch (updateState.status) {
    case 'checking':
      return [{ label: 'Checking for Updates...', enabled: false }];
    case 'downloading':
      return [{ label: `Downloading Update (${(updateState as any).percent}%)...`, enabled: false }];
    case 'ready':
      return [{
        label: `Restart to Update (v${(updateState as any).version})`,
        click: () => autoUpdater.quitAndInstall(),
      }];
    case 'error':
      return [{ label: 'Update Error — Retry', click: () => autoUpdater.checkForUpdates() }];
    default:
      return [{ label: 'Check for Updates...', click: () => autoUpdater.checkForUpdates() }];
  }
}
