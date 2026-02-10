import { app, BrowserWindow, ipcMain, shell, Notification } from 'electron';
import path from 'path';
import { GmailService } from './gmail';
import { HubSpotService } from './hubspot';
import { CalendarService } from './calendar';
import { startApiServer } from './api-server';
import { ConfigStore } from './config';
import { ViewStore, RuleStore } from './stores';
import { applyRules } from './rule-engine';
import { IPC } from '../shared/types';
import type { SendEmailPayload, View, Rule } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let gmail: GmailService;
let hubspot: HubSpotService;
let calendar: CalendarService;
let config: ConfigStore;
let viewStore: ViewStore;
let ruleStore: RuleStore;

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

  // Allow toggling DevTools with Cmd+Shift+I in production
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.meta && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

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
  viewStore = new ViewStore();
  ruleStore = new RuleStore();
  gmail = new GmailService(config);
  hubspot = new HubSpotService(config);
  calendar = new CalendarService();

  // Share OAuth client with calendar service
  const oauthClient = gmail.getOAuth2Client();
  if (oauthClient) {
    calendar.setAuth(oauthClient);
  }

  // Start the local API server if enabled
  const appConfig = config.get();
  if (appConfig.apiEnabled) {
    startApiServer(gmail, hubspot, appConfig.apiPort, viewStore, ruleStore, calendar);
  }
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
  ipcMain.handle(IPC.GMAIL_FETCH_THREADS, async (_event, query: string, maxResults: number = 50, pageToken?: string) => {
    const result = await gmail.fetchThreads(query, maxResults, pageToken);
    // Apply rules to inbox threads in the background (non-blocking)
    applyRules(ruleStore, gmail, result.threads)
      .then((madeChanges) => {
        if (madeChanges && mainWindow && !mainWindow.isDestroyed()) {
          // Tell the renderer to refresh since rules modified some threads
          mainWindow.webContents.send('rules-applied');
        }
      })
      .catch((e) => console.error('[Rules] Failed to apply rules:', e));
    return result;
  });

  ipcMain.handle(IPC.GMAIL_FETCH_THREAD, async (_event, threadId: string) => {
    return gmail.fetchThread(threadId);
  });

  ipcMain.handle(IPC.GMAIL_SEARCH, async (_event, query: string) => {
    const result = await gmail.fetchThreads(query, 50);
    return result.threads;
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

  ipcMain.handle(IPC.GMAIL_DOWNLOAD_ATTACHMENT, async (_event, messageId: string, attachmentId: string, filename: string) => {
    const filePath = await gmail.downloadAttachment(messageId, attachmentId, filename);
    shell.openPath(filePath);
    return filePath;
  });

  ipcMain.handle(IPC.GMAIL_GET_ATTACHMENT_BASE64, async (_event, messageId: string, attachmentId: string) => {
    const buffer = await gmail.getAttachmentBuffer(messageId, attachmentId);
    return buffer.toString('base64');
  });

  // ── Drafts ──
  ipcMain.handle(IPC.GMAIL_CREATE_DRAFT, async (_event, payload: any) => {
    return gmail.createDraft(payload);
  });

  ipcMain.handle(IPC.GMAIL_LIST_DRAFTS, async () => {
    return gmail.listDrafts();
  });

  ipcMain.handle(IPC.GMAIL_GET_DRAFT, async (_event, draftId: string) => {
    return gmail.getDraft(draftId);
  });

  ipcMain.handle(IPC.GMAIL_DELETE_DRAFT, async (_event, draftId: string) => {
    return gmail.deleteDraft(draftId);
  });

  ipcMain.handle(IPC.GMAIL_LIST_LABELS, async () => {
    return gmail.listLabels();
  });

  // ── File operations ──
  ipcMain.handle(IPC.FILE_READ_BASE64, async (_event, filePath: string) => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const data = await fs.readFile(filePath);
    const base64 = data.toString('base64');
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      zip: 'application/zip',
      txt: 'text/plain',
      csv: 'text/csv',
      html: 'text/html',
      json: 'application/json',
      mp4: 'video/mp4',
      mp3: 'audio/mpeg',
    };
    return {
      base64,
      mimeType: mimeTypes[ext] || 'application/octet-stream',
      size: data.length,
      filename: path.basename(filePath),
    };
  });

  // ── Calendar ──
  ipcMain.handle(IPC.CALENDAR_TODAY, async () => {
    return calendar.getTodayEvents();
  });

  ipcMain.handle(IPC.CALENDAR_RANGE, async (_event, timeMin: string, timeMax: string) => {
    return calendar.getEventsInRange(timeMin, timeMax);
  });

  ipcMain.handle(IPC.CALENDAR_RSVP, async (_event, eventId: string, response: 'accepted' | 'tentative' | 'declined', calendarId?: string) => {
    return calendar.rsvpEvent(eventId, response, calendarId || 'primary');
  });

  ipcMain.handle(IPC.CALENDAR_FIND_EVENT, async (_event, iCalUID: string) => {
    return calendar.findEventByICalUID(iCalUID);
  });

  // ── HubSpot ──
  ipcMain.handle(IPC.HUBSPOT_LOOKUP, async (_event, email: string) => {
    return hubspot.lookupContact(email);
  });

  ipcMain.handle(IPC.HUBSPOT_LOG, async (_event, payload: any) => {
    return hubspot.logEmail(payload, '');
  });

  ipcMain.handle(IPC.HUBSPOT_LOG_THREAD, async (_event, dealId: string, subject: string, body: string, senderEmail: string, recipientEmail: string) => {
    return hubspot.logThreadToDeal(dealId, subject, body, senderEmail, recipientEmail);
  });

  ipcMain.handle(IPC.HUBSPOT_SEARCH_DEALS, async (_event, query: string) => {
    return hubspot.searchDeals(query);
  });

  ipcMain.handle(IPC.HUBSPOT_ASSOCIATE_DEAL, async (_event, contactId: string, dealId: string) => {
    return hubspot.associateContactWithDeal(contactId, dealId);
  });

  // ── Badge & Notifications ──
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

  // ── Views & Rules ──
  ipcMain.handle(IPC.VIEWS_LIST, async () => {
    return viewStore.list();
  });

  ipcMain.handle(IPC.VIEWS_SAVE, async (_event, views: View[]) => {
    return viewStore.replace(views);
  });

  ipcMain.handle(IPC.RULES_LIST, async () => {
    return ruleStore.list();
  });

  ipcMain.handle(IPC.RULES_SAVE, async (_event, rules: Rule[]) => {
    return ruleStore.replace(rules);
  });

  // ── Config ──
  ipcMain.handle(IPC.APP_GET_CONFIG, async () => {
    return config.get();
  });

  ipcMain.handle(IPC.APP_SET_CONFIG, async (_event, updates: any) => {
    return config.update(updates);
  });

  ipcMain.handle(IPC.APP_USER_EMAIL, async () => {
    return gmail.getUserEmail();
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
