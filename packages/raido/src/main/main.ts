import { app, BrowserWindow, ipcMain, shell, Notification, dialog } from 'electron';
import fs from 'fs';
import path from 'path';

import { startApiServer } from './api-server';
import { ConfigStore } from './config';
import { TaskStore } from './task-store';
import { IPC } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let config: ConfigStore;
let store: TaskStore;
let badgeInterval: ReturnType<typeof setInterval> | null = null;

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log(`[Raidō] v${app.getVersion()} — ${isDev ? 'development' : 'production'}`);
  console.log('[Raidō] __dirname:', __dirname);
  console.log('[Raidō] preload path:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#12100e',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5174');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const htmlPath = path.join(__dirname, '../../renderer/index.html');
    console.log('[Raidō] Loading HTML from:', htmlPath);
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.meta && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Raidō] Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initServices() {
  config = new ConfigStore();
  store = new TaskStore();

  const appConfig = config.get();
  if (appConfig.apiEnabled) {
    startApiServer(store, appConfig.apiPort);
  }
}

// ── MCP ─────────────────────────────────────────────────────
// Unified Futhark MCP server installed to ~/.futhark/ on startup.

// ── Badge Management ─────────────────────────────────────────

function updateDockBadge() {
  if (process.platform !== 'darwin' || !app.dock) return;
  const count = store.getOverdueCount();
  app.dock.setBadge(count > 0 ? count.toString() : '');
}

function startBadgeMonitor() {
  updateDockBadge();
  badgeInterval = setInterval(updateDockBadge, 60000);
}

// ── IPC Handlers ─────────────────────────────────────────────

function notifyTasksChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tasks:changed');
  }
  updateDockBadge();
}

function registerIpcHandlers() {
  // Tasks
  ipcMain.handle(IPC.TASKS_TODAY, async () => store.getToday());
  ipcMain.handle(IPC.TASKS_INBOX, async () => store.getInbox());
  ipcMain.handle(IPC.TASKS_UPCOMING, async () => store.getUpcoming());
  ipcMain.handle(IPC.TASK_GET, async (_event, id: string) => store.getTask(id));

  ipcMain.handle(IPC.TASK_CREATE, async (_event, data: any) => {
    const task = store.createTask(data);
    notifyTasksChanged();
    return task;
  });

  ipcMain.handle(IPC.TASK_UPDATE, async (_event, id: string, updates: any) => {
    const task = store.updateTask(id, updates);
    notifyTasksChanged();
    return task;
  });

  ipcMain.handle(IPC.TASK_DELETE, async (_event, id: string) => {
    store.deleteTask(id);
    notifyTasksChanged();
  });

  ipcMain.handle(IPC.TASK_COMPLETE, async (_event, id: string) => {
    const result = store.completeTask(id);
    notifyTasksChanged();
    return result;
  });

  ipcMain.handle(IPC.TASKS_SEARCH, async (_event, query: string) => store.searchTasks(query));
  ipcMain.handle(IPC.TASKS_LOGBOOK, async (_event, days?: number) => store.getLogbook(days));
  ipcMain.handle(IPC.TASKS_STATS, async () => store.getStats());
  ipcMain.handle(IPC.TASKS_TAGGED, async (_event, tagName: string) => store.getTaggedTasks(tagName));

  // Groups
  ipcMain.handle(IPC.GROUPS_LIST, async () => store.getGroups());
  ipcMain.handle(IPC.GROUP_GET, async (_event, name: string) => store.getGroup(name));

  // Tags
  ipcMain.handle(IPC.TAGS_LIST, async () => store.getTags());

  // App
  ipcMain.handle(IPC.APP_GET_CONFIG, async () => config.get());

  ipcMain.handle(IPC.APP_SET_CONFIG, async (_event, updates: any) => {
    return config.update(updates);
  });

  ipcMain.handle(IPC.APP_SET_BADGE, async (_event, count: number) => {
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setBadge(count > 0 ? String(count) : '');
    }
  });

  ipcMain.handle(IPC.APP_NOTIFY, async (_event, title: string, body: string) => {
    if (Notification.isSupported()) {
      const notif = new Notification({ title, body, silent: false });
      notif.on('click', () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      });
      notif.show();
    }
  });

  // Attachments
  ipcMain.handle(IPC.ATTACHMENTS_LIST, async (_event, taskId: string) => store.getAttachments(taskId));

  ipcMain.handle(IPC.ATTACHMENT_OPEN, async (_event, taskId: string, attachmentId: string) => {
    const filePath = store.getAttachmentPath(taskId, attachmentId);
    if (filePath && fs.existsSync(filePath)) {
      shell.openPath(filePath);
    }
  });

  ipcMain.handle(IPC.ATTACHMENT_DELETE, async (_event, taskId: string, attachmentId: string) => {
    return store.deleteAttachment(taskId, attachmentId);
  });

  ipcMain.handle(IPC.ATTACHMENT_ADD, async (_event, taskId: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Attach file to task',
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const filename = path.basename(filePath);
    const buffer = fs.readFileSync(filePath);
    return store.addAttachment(taskId, filename, buffer, { source: 'upload' });
  });

  // Checklist
  ipcMain.handle(IPC.CHECKLIST_LIST, async (_event, taskId: string) => store.getChecklistItems(taskId));

  ipcMain.handle(IPC.CHECKLIST_ADD, async (_event, taskId: string, title: string) => {
    const item = store.addChecklistItem(taskId, title);
    notifyTasksChanged();
    return item;
  });

  ipcMain.handle(IPC.CHECKLIST_UPDATE, async (_event, id: string, updates: any) => {
    const item = store.updateChecklistItem(id, updates);
    notifyTasksChanged();
    return item;
  });

  ipcMain.handle(IPC.CHECKLIST_DELETE, async (_event, id: string) => {
    const ok = store.deleteChecklistItem(id);
    notifyTasksChanged();
    return ok;
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

  // MCP
  ipcMain.handle(IPC.MCP_STATUS, async () => {
    const appConfig = config.get();
    let mcpConfig = {};
    let installed = false;
    try {
      const corePkg = require.resolve('@futhark/core/package.json');
      const installerPath = path.join(path.dirname(corePkg), 'dist', 'mcp', 'installer.js');
      const { getFutharkMcpConfig, isMcpInstalled } = require(installerPath);
      mcpConfig = getFutharkMcpConfig();
      installed = isMcpInstalled();
    } catch {}
    return {
      enabled: appConfig.mcpEnabled,
      installed,
      claudeDesktopConfig: mcpConfig,
    };
  });
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
    console.error('[Raidō] Failed to install Futhark MCP:', e.message);
  }
}

app.whenReady().then(async () => {
  await initServices();
  registerIpcHandlers();
  createWindow();
  startBadgeMonitor();
  installFutharkMcp();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (badgeInterval) clearInterval(badgeInterval);
  store.close();
});
