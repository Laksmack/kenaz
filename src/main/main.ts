import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { GmailService } from './gmail';
import { HubSpotService } from './hubspot';
import { CalendarService } from './calendar';
import { startApiServer } from './api-server';
import { ConfigStore } from './config';
import { IPC } from '../shared/types';
import type { SendEmailPayload } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let gmail: GmailService;
let hubspot: HubSpotService;
let calendar: CalendarService;
let config: ConfigStore;

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('[Kenaz] __dirname:', __dirname);
  console.log('[Kenaz] preload path:', preloadPath);
  console.log('[Kenaz] isDev:', isDev);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const htmlPath = path.join(__dirname, '../../renderer/index.html');
    console.log('[Kenaz] Loading HTML from:', htmlPath);
    mainWindow.loadFile(htmlPath);
  }

  // Log renderer errors
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Kenaz] Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('console-message', (_event, _level, message) => {
    console.log('[Renderer]', message);
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
  gmail = new GmailService(config);
  hubspot = new HubSpotService(config);
  calendar = new CalendarService();

  // Share OAuth client with calendar service
  const oauthClient = gmail.getOAuth2Client();
  if (oauthClient) {
    calendar.setAuth(oauthClient);
  }

  // Start the local API server for Claude integration
  const appConfig = config.get();
  startApiServer(gmail, hubspot, appConfig.apiPort);
}

function registerIpcHandlers() {
  // ── Gmail Auth ──
  ipcMain.handle(IPC.GMAIL_AUTH, async () => {
    const result = await gmail.authenticate();
    // After successful auth, share OAuth with calendar
    if (result.success) {
      const oauthClient = gmail.getOAuth2Client();
      if (oauthClient) calendar.setAuth(oauthClient);
    }
    return result;
  });

  ipcMain.handle(IPC.GMAIL_AUTH_STATUS, async () => {
    return gmail.isAuthenticated();
  });

  // ── Gmail Operations ──
  ipcMain.handle(IPC.GMAIL_FETCH_THREADS, async (_event, query: string, maxResults: number = 50) => {
    return gmail.fetchThreads(query, maxResults);
  });

  ipcMain.handle(IPC.GMAIL_FETCH_THREAD, async (_event, threadId: string) => {
    return gmail.fetchThread(threadId);
  });

  ipcMain.handle(IPC.GMAIL_SEARCH, async (_event, query: string) => {
    return gmail.fetchThreads(query, 50);
  });

  ipcMain.handle(IPC.GMAIL_SEND, async (_event, payload: SendEmailPayload) => {
    const result = await gmail.sendEmail(payload);
    // Auto-log to HubSpot if deal ID provided
    if (payload.hubspot_deal_id && result.id) {
      try {
        await hubspot.logEmail(payload, result.id);
      } catch (e) {
        console.error('Failed to log to HubSpot:', e);
      }
    }
    return result;
  });

  ipcMain.handle(IPC.GMAIL_ARCHIVE, async (_event, threadId: string) => {
    return gmail.archiveThread(threadId);
  });

  ipcMain.handle(IPC.GMAIL_LABEL, async (_event, threadId: string, labelToAdd: string | null, labelToRemove: string | null) => {
    return gmail.modifyLabels(threadId, labelToAdd, labelToRemove);
  });

  ipcMain.handle(IPC.GMAIL_MARK_READ, async (_event, threadId: string) => {
    return gmail.markAsRead(threadId);
  });

  // ── Calendar ──
  ipcMain.handle(IPC.CALENDAR_TODAY, async () => {
    return calendar.getTodayEvents();
  });

  ipcMain.handle(IPC.CALENDAR_RANGE, async (_event, timeMin: string, timeMax: string) => {
    return calendar.getEventsInRange(timeMin, timeMax);
  });

  // ── HubSpot ──
  ipcMain.handle(IPC.HUBSPOT_LOOKUP, async (_event, email: string) => {
    return hubspot.lookupContact(email);
  });

  ipcMain.handle(IPC.HUBSPOT_LOG, async (_event, payload: any) => {
    return hubspot.logEmail(payload, '');
  });

  // ── Config ──
  ipcMain.handle(IPC.APP_GET_CONFIG, async () => {
    return config.get();
  });

  ipcMain.handle(IPC.APP_SET_CONFIG, async (_event, updates: any) => {
    return config.update(updates);
  });
}

app.whenReady().then(async () => {
  await initServices();
  registerIpcHandlers();
  createWindow();

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
