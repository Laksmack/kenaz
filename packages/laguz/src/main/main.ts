import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import path from 'path';

import { config } from './config';
import { startApiServer } from './api-server';
import { VaultStore } from './vault-store';
import { VaultWatcher } from './watcher';
import { LaguzConfigManager } from './laguz-config';

let mainWindow: BrowserWindow | null = null;
let store: VaultStore;
let watcher: VaultWatcher;
let configManager: LaguzConfigManager;

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log(`[Laguz] v${app.getVersion()} — ${isDev ? 'development' : 'production'}`);
  console.log('[Laguz] __dirname:', __dirname);
  console.log('[Laguz] preload path:', preloadPath);
  console.log('[Laguz] vault path:', config.vaultPath);

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f1a1e',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    const devURL = 'http://localhost:5177';
    mainWindow.loadURL(devURL).catch(() => {
      console.log('[Laguz] Vite not ready, retrying in 2s...');
      setTimeout(() => mainWindow?.loadURL(devURL), 2000);
    });
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const htmlPath = path.join(__dirname, '../../renderer/index.html');
    console.log('[Laguz] Loading HTML from:', htmlPath);
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.meta && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Laguz] Failed to load:', errorCode, errorDescription);
    if (isDev && errorCode === -102) {
      console.log('[Laguz] Connection refused — Vite probably not ready, retrying...');
      setTimeout(() => {
        mainWindow?.loadURL('http://localhost:5177');
      }, 2000);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    console.log('[Laguz] Window closed');
    mainWindow = null;
  });
}

// ── MCP ─────────────────────────────────────────────────────
// Unified Futhark MCP server installed to ~/.futhark/ on startup.

// ── IPC Handlers ─────────────────────────────────────────────

function registerIpcHandlers() {
  ipcMain.handle('laguz:search', async (_event, params: any) => {
    return store.search(params.q || '', {
      type: params.type,
      company: params.company,
      since: params.since,
      tags: params.tags ? params.tags.split(',') : undefined,
    });
  });

  ipcMain.handle('laguz:getNote', async (_event, notePath: string) => {
    return store.getNote(notePath);
  });

  ipcMain.handle('laguz:getMeetings', async (_event, company: string, since?: string) => {
    return store.getMeetings(company, since);
  });

  ipcMain.handle('laguz:getAccount', async (_event, folderPath: string) => {
    return store.getAccount(folderPath);
  });

  ipcMain.handle('laguz:getSubfolders', async (_event, parentPath: string) => {
    return store.getSubfolders(parentPath);
  });

  ipcMain.handle('laguz:getFolderNotes', async (_event, folderPath: string) => {
    return store.getFolderNotes(folderPath);
  });

  ipcMain.handle('laguz:getUnprocessed', async (_event, since?: string) => {
    return store.getUnprocessed(since);
  });

  ipcMain.handle('laguz:writeNote', async (_event, notePath: string, content: string) => {
    store.writeNote(notePath, content);
    return store.getNote(notePath);
  });

  ipcMain.handle('laguz:getCompanies', async () => {
    return store.getCompanies();
  });

  ipcMain.handle('laguz:getRecent', async (_event, limit?: number) => {
    return store.getRecent(limit);
  });

  ipcMain.handle('laguz:getConfig', async () => {
    return configManager.get();
  });

  ipcMain.handle('laguz:saveConfig', async (_event, newConfig: any) => {
    configManager.save(newConfig);
    return configManager.get();
  });

  // Cross-app
  ipcMain.handle('cross-app:fetch', async (_event, url: string, options?: any) => {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Cross-app request failed (${res.status}): ${text}`);
    }
    return res.json();
  });
}

async function initServices() {
  configManager = new LaguzConfigManager();
  store = new VaultStore();
  startApiServer(store, config.apiPort);

  watcher = new VaultWatcher(store);
  await watcher.start();
}

// ── App Lifecycle ────────────────────────────────────────────

async function installFutharkMcp() {
  try {
    const corePkg = require.resolve('@futhark/core/package.json');
    const installerPath = path.join(path.dirname(corePkg), 'dist', 'mcp', 'installer.js');
    const bundlePath = path.join(path.dirname(corePkg), 'dist', 'mcp', 'futhark-mcp.js');
    const { ensureFutharkMcp } = require(installerPath);
    await ensureFutharkMcp({
      bundlePath,
      showPrompt: async (msg: string) => {
        const { response } = await dialog.showMessageBox({
          type: 'question',
          buttons: ['Register', 'Not Now'],
          defaultId: 0,
          title: 'Futhark MCP',
          message: msg,
        });
        return response === 0;
      },
    });
  } catch (e: any) {
    console.error('[Laguz] Failed to install Futhark MCP:', e.message);
  }
}

app.whenReady().then(async () => {
  try {
    await initServices();
  } catch (e: any) {
    console.error('[Laguz] initServices failed:', e);
  }
  registerIpcHandlers();
  createWindow();
  installFutharkMcp();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  console.log('[Laguz] All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  console.log('[Laguz] will-quit event');
});

app.on('before-quit', () => {
  console.log('[Laguz] before-quit event');
  watcher?.stop();
  store?.close();
});

process.on('uncaughtException', (e) => {
  console.error('[Laguz] Uncaught exception:', e);
});

process.on('unhandledRejection', (e) => {
  console.error('[Laguz] Unhandled rejection:', e);
});
