import { app, BrowserWindow, ipcMain, shell, Notification, nativeImage } from 'electron';
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
    backgroundColor: '#0a0a0a',
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

  // Allow toggling DevTools with Cmd+Shift+I in production
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.meta && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Raidō] Failed to load:', errorCode, errorDescription);
  });

  // Open external links in browser
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

  // Start the local API server
  if (appConfig.apiEnabled) {
    startApiServer(store, appConfig.apiPort);
  }
}

// ── MCP Server Config ────────────────────────────────────────

function getMcpServerPath(): string {
  const appPath = app.getAppPath();
  const base = appPath.endsWith('.asar')
    ? appPath.replace(/\.asar$/, '.asar.unpacked')
    : appPath;
  return path.join(base, 'dist', 'mcp', 'mcp-server.js');
}

function getMcpClaudeDesktopConfig(apiPort: number): object {
  return {
    mcpServers: {
      raido: {
        command: 'node',
        args: [getMcpServerPath()],
        env: {
          RAIDO_API_PORT: String(apiPort),
        },
      },
    },
  };
}

// ── Badge Management ─────────────────────────────────────────

function getBaseIconPath(): string {
  if (isDev) {
    return path.join(__dirname, '../../..', 'branding', 'icon-512.png');
  }
  return path.join(app.getAppPath(), 'branding', 'icon-512.png');
}

async function updateDockBadge() {
  if (process.platform !== 'darwin' || !app.dock) return;

  const overdueCount = store.getOverdueCount();

  if (overdueCount === 0) {
    // Revert to base icon
    try {
      const baseIcon = nativeImage.createFromPath(getBaseIconPath());
      if (!baseIcon.isEmpty()) {
        app.dock.setIcon(baseIcon);
      }
    } catch (e) {
      // Silently fail — icon may not exist in dev
    }
    app.dock.setBadge('');
    return;
  }

  // Show badge count
  const displayCount = overdueCount > 9 ? '9+' : String(overdueCount);
  app.dock.setBadge(displayCount);
}

function startBadgeMonitor() {
  // Initial check
  updateDockBadge();

  // Check every 60 seconds
  badgeInterval = setInterval(updateDockBadge, 60000);
}

// ── IPC Handlers ─────────────────────────────────────────────

function notifyTasksChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tasks:changed');
  }
  // Also update badge immediately
  updateDockBadge();
}

function registerIpcHandlers() {
  // Tasks
  ipcMain.handle(IPC.TASKS_TODAY, async () => store.getToday());
  ipcMain.handle(IPC.TASKS_INBOX, async () => store.getInbox());
  ipcMain.handle(IPC.TASKS_UPCOMING, async () => store.getUpcoming());
  ipcMain.handle(IPC.TASKS_SOMEDAY, async () => store.getSomeday());
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
    const task = store.completeTask(id);
    notifyTasksChanged();
    return task;
  });

  ipcMain.handle(IPC.TASKS_SEARCH, async (_event, query: string) => store.searchTasks(query));
  ipcMain.handle(IPC.TASKS_LOGBOOK, async (_event, days?: number) => store.getLogbook(days));
  ipcMain.handle(IPC.TASKS_STATS, async () => store.getStats());
  ipcMain.handle(IPC.TASKS_TAGGED, async (_event, tagName: string) => store.getTaggedTasks(tagName));

  // Projects
  ipcMain.handle(IPC.PROJECTS_LIST, async () => store.getProjects());
  ipcMain.handle(IPC.PROJECT_GET, async (_event, id: string) => store.getProject(id));

  ipcMain.handle(IPC.PROJECT_CREATE, async (_event, data: any) => {
    const project = store.createProject(data);
    notifyTasksChanged();
    return project;
  });

  ipcMain.handle(IPC.PROJECT_UPDATE, async (_event, id: string, updates: any) => {
    const project = store.updateProject(id, updates);
    notifyTasksChanged();
    return project;
  });

  ipcMain.handle(IPC.PROJECT_COMPLETE, async (_event, id: string) => {
    const project = store.completeProject(id);
    notifyTasksChanged();
    return project;
  });

  // Areas
  ipcMain.handle(IPC.AREAS_LIST, async () => store.getAreas());

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

  // MCP
  ipcMain.handle(IPC.MCP_STATUS, async () => {
    const appConfig = config.get();
    return {
      enabled: appConfig.mcpEnabled,
      claudeDesktopConfig: getMcpClaudeDesktopConfig(appConfig.apiPort),
      serverPath: getMcpServerPath(),
    };
  });
}

// ── App Lifecycle ────────────────────────────────────────────

app.whenReady().then(async () => {
  await initServices();
  registerIpcHandlers();
  createWindow();
  startBadgeMonitor();

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
