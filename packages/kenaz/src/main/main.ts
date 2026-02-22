import { app, BrowserWindow, ipcMain, shell, Notification, Menu, MenuItem, dialog } from 'electron';
import path from 'path';

import { GmailService } from './gmail';
import { HubSpotService } from './hubspot';
import { CalendarService } from './calendar';
import { startApiServer } from './api-server';
import { ConfigStore } from './config';
import { ViewStore, RuleStore } from './stores';
import { applyRules } from './rule-engine';
import { CacheStore } from './cache-store';
import { ConnectivityMonitor } from './connectivity';
import { SyncEngine } from './sync-engine';
import { IPC } from '../shared/types';
import type { SendEmailPayload, View, Rule } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let gmail: GmailService;
let hubspot: HubSpotService;
let calendar: CalendarService;
let config: ConfigStore;
let viewStore: ViewStore;
let ruleStore: RuleStore;
let cache: CacheStore;
let connectivity: ConnectivityMonitor;
let syncEngine: SyncEngine;

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log(`[Kenaz] v${app.getVersion()} — ${isDev ? 'development' : 'production'}`);
  console.log('[Kenaz] __dirname:', __dirname);
  console.log('[Kenaz] preload path:', preloadPath);

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
      spellcheck: true,
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

  // Native context menu with spell-check suggestions
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();

    // Spell-check suggestions
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        menu.append(new MenuItem({
          label: suggestion,
          click: () => mainWindow?.webContents.replaceMisspelling(suggestion),
        }));
      }
      if (params.dictionarySuggestions.length > 0) {
        menu.append(new MenuItem({ type: 'separator' }));
      }
      menu.append(new MenuItem({
        label: 'Add to Dictionary',
        click: () => mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Standard edit actions
    if (params.selectionText) {
      menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
    }
    if (params.isEditable) {
      menu.append(new MenuItem({ label: 'Cut', role: 'cut' }));
      menu.append(new MenuItem({ label: 'Paste', role: 'paste' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: 'Select All', role: 'selectAll' }));
    }

    if (menu.items.length > 0) {
      menu.popup();
    }
  });

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
    connectivity.setMainWindow(null);
    syncEngine.setMainWindow(null);
  });

  // Wire connectivity and sync engine to the window
  connectivity.setMainWindow(mainWindow);
  syncEngine.setMainWindow(mainWindow);
}

async function initServices() {
  config = new ConfigStore();
  viewStore = new ViewStore();
  ruleStore = new RuleStore();
  gmail = new GmailService(config);
  hubspot = new HubSpotService(config);
  calendar = new CalendarService();

  // Initialize cache
  const appConfig = config.get();
  cache = new CacheStore();

  // Initialize connectivity monitor
  connectivity = new ConnectivityMonitor();
  connectivity.setGmail(gmail);
  connectivity.start();

  // Initialize sync engine
  syncEngine = new SyncEngine(gmail, cache, connectivity, config);

  // Share OAuth client with calendar service
  const oauthClient = gmail.getOAuth2Client();
  if (oauthClient) {
    calendar.setAuth(oauthClient);
  }

  // Start the local API server if enabled
  if (appConfig.apiEnabled) {
    startApiServer(gmail, hubspot, appConfig.apiPort, viewStore, ruleStore, calendar, config, () => mainWindow, cache);
  }

}

// ── MCP ─────────────────────────────────────────────────────
// The unified Futhark MCP server is installed to ~/.futhark/mcp-server.js
// by installFutharkMcp() on startup. See packages/core/mcp/ for source.

// ── Helper: wrap an async Gmail call with offline awareness ──

async function withOfflineAwareness<T>(fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    connectivity.reportOnline();
    return result;
  } catch (e: any) {
    const msg = (e.message || '').toLowerCase();
    if (msg.includes('enotfound') || msg.includes('enetunreach') ||
        msg.includes('econnrefused') || msg.includes('etimedout') ||
        msg.includes('err_network') || msg.includes('fetch failed')) {
      connectivity.reportOffline();
    }
    throw e;
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
      // Start sync engine after authentication
      syncEngine.start();
    }
    return result;
  });

  ipcMain.handle(IPC.GMAIL_AUTH_STATUS, async () => {
    const isAuth = await gmail.isAuthenticated();
    // Start sync engine if already authenticated
    if (isAuth) {
      syncEngine.start();
    }
    return isAuth;
  });

  // ── Gmail Operations (cache-first) ──
  ipcMain.handle(IPC.GMAIL_FETCH_THREADS, async (_event, query: string, maxResults: number = 50, pageToken?: string) => {
    const appConfig = config.get();

    // 1. Return cached data immediately if available (and no page token — first page only)
    let cachedThreads: any[] = [];
    if (appConfig.cacheEnabled && !pageToken) {
      try {
        cachedThreads = cache.getThreadsByQuery(query, maxResults);
      } catch (e) {
        console.error('[Cache] Failed to read cache:', e);
      }
    }

    // 2. If offline, return cached data
    if (!connectivity.isOnline) {
      return { threads: cachedThreads, nextPageToken: undefined, fromCache: true };
    }

    // 3. If online, fetch from API
    try {
      const result = await withOfflineAwareness(() =>
        gmail.fetchThreads(query, maxResults, pageToken)
      );

      // Cache the results
      if (appConfig.cacheEnabled && result.threads.length > 0) {
        try {
          cache.upsertThreads(result.threads);
          // Cache message metadata
          for (const thread of result.threads) {
            if (thread.messages.length > 0) {
              cache.upsertMessages(thread.messages);
            }
          }

          // Record contacts for autocomplete
          const contacts: Array<{ name: string; email: string }> = [];
          for (const thread of result.threads) {
            contacts.push(thread.from);
            if (thread.participants) contacts.push(...thread.participants);
            for (const msg of thread.messages) {
              contacts.push(msg.from);
              contacts.push(...msg.to);
              contacts.push(...msg.cc);
            }
          }
          cache.recordContacts(contacts);

          // Merge nudge info from cache onto API-fetched threads
          // (The sync engine sets nudgeType via History API; the API fetch doesn't include it)
          for (const thread of result.threads) {
            const cached = cache.getThread(thread.id);
            if (cached?.nudgeType) {
              thread.nudgeType = cached.nudgeType;
            }
          }
        } catch (e) {
          console.error('[Cache] Failed to write cache:', e);
        }
      }

      // Apply rules to inbox threads in the background (non-blocking)
      applyRules(ruleStore, gmail, result.threads)
        .then((madeChanges) => {
          if (madeChanges && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('rules-applied');
          }
        })
        .catch((e) => console.error('[Rules] Failed to apply rules:', e));

      return result;
    } catch (e: any) {
      // If API call fails, fall back to cache
      if (cachedThreads.length > 0) {
        console.log('[Kenaz] API failed, returning cached threads');
        return { threads: cachedThreads, nextPageToken: undefined, fromCache: true };
      }
      throw e;
    }
  });

  ipcMain.handle(IPC.GMAIL_FETCH_THREAD, async (_event, threadId: string) => {
    const appConfig = config.get();

    // 1. Check cache for full thread
    if (appConfig.cacheEnabled) {
      const cached = cache.getThread(threadId);
      if (cached && cached.messages.length > 0 && cached.messages[0].body) {
        // If online, refresh in background
        if (connectivity.isOnline) {
          withOfflineAwareness(() => gmail.fetchThread(threadId))
            .then((fresh) => {
              if (fresh) {
                cache.upsertFullThread(fresh);
                // Notify renderer if data changed
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('thread:updated', fresh);
                }
              }
            })
            .catch(() => {}); // Silent failure for background refresh
        }
        return cached;
      }
    }

    // 2. If offline and no cache, return null
    if (!connectivity.isOnline) {
      // Return metadata-only version from cache if available
      if (appConfig.cacheEnabled) {
        return cache.getThread(threadId);
      }
      return null;
    }

    // 3. Fetch from API
    try {
      const thread = await withOfflineAwareness(() => gmail.fetchThread(threadId));

      // Cache the full thread
      if (thread && appConfig.cacheEnabled) {
        try {
          cache.upsertFullThread(thread);
        } catch (e) {
          console.error('[Cache] Failed to cache thread:', e);
        }
      }

      return thread;
    } catch (e) {
      // Fall back to cache
      if (appConfig.cacheEnabled) {
        return cache.getThread(threadId);
      }
      throw e;
    }
  });

  ipcMain.handle(IPC.GMAIL_SEARCH, async (_event, query: string) => {
    const appConfig = config.get();

    // 1. Search local cache immediately
    let localResults: any[] = [];
    if (appConfig.cacheEnabled) {
      try {
        localResults = cache.searchLocal(query, 50);
      } catch {}
    }

    // 2. If offline, return local results
    if (!connectivity.isOnline) {
      return localResults;
    }

    // 3. Fetch from API and merge
    try {
      const result = await withOfflineAwareness(() => gmail.fetchThreads(query, 50));

      // Cache API results
      if (appConfig.cacheEnabled && result.threads.length > 0) {
        try {
          cache.upsertThreads(result.threads);
          for (const thread of result.threads) {
            if (thread.messages.length > 0) {
              cache.upsertMessages(thread.messages);
            }
          }
        } catch {}
      }

      // Merge: API results take precedence, add local-only results
      const apiIds = new Set(result.threads.map((t: any) => t.id));
      const uniqueLocal = localResults.filter(t => !apiIds.has(t.id));
      return [...result.threads, ...uniqueLocal];
    } catch {
      return localResults;
    }
  });

  ipcMain.handle(IPC.GMAIL_SEND, async (_event, payload: SendEmailPayload) => {
    // If offline, queue in outbox
    if (!connectivity.isOnline) {
      const outboxId = cache.enqueueOutbox(payload);
      return { queued: true, outboxId };
    }

    try {
      const result = await withOfflineAwareness(() => gmail.sendEmail(payload));
      // Auto-log to HubSpot if deal ID provided
      if (payload.hubspot_deal_id && result.id) {
        try {
          await hubspot.logEmail(payload, result.id);
        } catch (e) {
          console.error('Failed to log to HubSpot:', e);
        }
      }
      // Record recipients for autocomplete (boost=3 — sent-to contacts are high-signal)
      try {
        const sentTo: Array<{ name: string; email: string }> = [];
        if (payload.to) sentTo.push(...payload.to.split(',').map(e => ({ name: '', email: e.trim() })));
        if (payload.cc) sentTo.push(...payload.cc.split(',').map(e => ({ name: '', email: e.trim() })));
        if (payload.bcc) sentTo.push(...payload.bcc.split(',').map(e => ({ name: '', email: e.trim() })));
        cache.recordContacts(sentTo, 3);
      } catch {}
      return result;
    } catch (e: any) {
      // If network failure, queue in outbox
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('enotfound') || msg.includes('enetunreach') ||
          msg.includes('econnrefused') || msg.includes('etimedout')) {
        const outboxId = cache.enqueueOutbox(payload);
        return { queued: true, outboxId };
      }
      throw e;
    }
  });

  ipcMain.handle(IPC.GMAIL_ARCHIVE, async (_event, threadId: string) => {
    // Update cache immediately
    cache.updateThreadLabels(threadId, [], ['INBOX']);

    if (!connectivity.isOnline) {
      cache.enqueuePendingAction('archive', threadId, {});
      return;
    }

    try {
      await withOfflineAwareness(() => gmail.archiveThread(threadId));
    } catch (e: any) {
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('enotfound') || msg.includes('enetunreach') ||
          msg.includes('econnrefused') || msg.includes('etimedout')) {
        cache.enqueuePendingAction('archive', threadId, {});
      } else {
        throw e;
      }
    }
  });

  ipcMain.handle(IPC.GMAIL_LABEL, async (_event, threadId: string, labelToAdd: string | null, labelToRemove: string | null) => {
    // Update cache immediately
    const addLabels = labelToAdd ? [labelToAdd] : [];
    const removeLabels = labelToRemove ? [labelToRemove] : [];
    cache.updateThreadLabels(threadId, addLabels, removeLabels);

    if (!connectivity.isOnline) {
      cache.enqueuePendingAction('label', threadId, { add: labelToAdd, remove: labelToRemove });
      return;
    }

    try {
      await withOfflineAwareness(() => gmail.modifyLabels(threadId, labelToAdd, labelToRemove));
    } catch (e: any) {
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('enotfound') || msg.includes('enetunreach') ||
          msg.includes('econnrefused') || msg.includes('etimedout')) {
        cache.enqueuePendingAction('label', threadId, { add: labelToAdd, remove: labelToRemove });
      } else {
        throw e;
      }
    }
  });

  ipcMain.handle(IPC.GMAIL_MARK_READ, async (_event, threadId: string) => {
    // Update cache immediately
    cache.updateThreadLabels(threadId, [], ['UNREAD']);

    if (!connectivity.isOnline) {
      cache.enqueuePendingAction('mark_read', threadId, {});
      return;
    }

    try {
      await withOfflineAwareness(() => gmail.markAsRead(threadId));
    } catch (e: any) {
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('enotfound') || msg.includes('enetunreach') ||
          msg.includes('econnrefused') || msg.includes('etimedout')) {
        cache.enqueuePendingAction('mark_read', threadId, {});
      } else {
        throw e;
      }
    }
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
    const appConfig = config.get();
    return calendar.getTodayEvents(appConfig.excludedCalendarIds || []);
  });

  ipcMain.handle(IPC.CALENDAR_RANGE, async (_event, timeMin: string, timeMax: string) => {
    const appConfig = config.get();
    return calendar.getEventsInRange(timeMin, timeMax, appConfig.excludedCalendarIds || []);
  });

  ipcMain.handle(IPC.CALENDAR_RSVP, async (_event, eventId: string, response: 'accepted' | 'tentative' | 'declined', calendarId?: string) => {
    return calendar.rsvpEvent(eventId, response, calendarId || 'primary');
  });

  ipcMain.handle(IPC.CALENDAR_FIND_EVENT, async (_event, iCalUID: string) => {
    return calendar.findEventByICalUID(iCalUID);
  });

  ipcMain.handle(IPC.CALENDAR_LIST, async () => {
    return calendar.listCalendars();
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

  // ── Connectivity ──
  ipcMain.handle(IPC.CONNECTIVITY_STATUS, async () => {
    return {
      online: connectivity.isOnline,
      pendingActions: cache.getPendingActionCount(),
      outboxCount: cache.getOutboxCount(),
    };
  });

  // ── Cache ──
  ipcMain.handle(IPC.CACHE_GET_STATS, async () => {
    return cache.getStats();
  });

  ipcMain.handle(IPC.CACHE_CLEAR, async () => {
    cache.clearCache();
  });

  ipcMain.handle(IPC.CACHE_SEARCH_LOCAL, async (_event, query: string) => {
    return cache.searchLocal(query, 50);
  });

  // ── Outbox ──
  ipcMain.handle(IPC.OUTBOX_LIST, async () => {
    return cache.getOutboxItems();
  });

  ipcMain.handle(IPC.OUTBOX_CANCEL, async (_event, id: number) => {
    cache.cancelOutboxItem(id);
  });

  ipcMain.handle(IPC.OUTBOX_RETRY, async (_event, id: number) => {
    // Re-queue the item by resetting its status
    const items = cache.getOutboxItems();
    const item = items.find(i => i.id === id);
    if (item && connectivity.isOnline) {
      try {
        cache.markOutboxSending(id);
        const result = await gmail.sendEmail(item.payload);
        cache.markOutboxSent(id);
        return result;
      } catch (e: any) {
        cache.markOutboxFailed(id, e.message);
        throw e;
      }
    }
  });

  // ── Contacts ──
  ipcMain.handle(IPC.CONTACTS_SUGGEST, async (_event, prefix: string, limit?: number) => {
    return cache.suggestContacts(prefix, limit);
  });

  // ── Snooze ──
  ipcMain.handle(IPC.SNOOZE_THREAD, async (_event, threadId: string, days: number) => {
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + days);
    snoozeUntil.setHours(8, 0, 0, 0); // Wake at 8am local time
    const snoozeUntilStr = snoozeUntil.toISOString();

    // Get current labels before snoozing
    const thread = cache.getThread(threadId);
    const originalLabels = thread?.labels || [];

    // Record in local DB
    cache.snoozeThread(threadId, snoozeUntilStr, originalLabels);

    // Apply Gmail label changes: add SNOOZED, remove INBOX
    cache.updateThreadLabels(threadId, ['SNOOZED'], ['INBOX']);
    try {
      await gmail.modifyLabels(threadId, 'SNOOZED', 'INBOX');
    } catch (e: any) {
      // Queue for offline retry
      cache.enqueuePendingAction('label', threadId, { add: 'SNOOZED', remove: 'INBOX' });
    }

    return { snoozeUntil: snoozeUntilStr };
  });

  ipcMain.handle(IPC.SNOOZE_CANCEL, async (_event, threadId: string) => {
    const snoozeInfo = cache.getSnoozedThread(threadId);
    if (!snoozeInfo) return;

    // Remove snooze record
    cache.cancelSnooze(threadId);

    // Restore: remove SNOOZED, add INBOX
    cache.updateThreadLabels(threadId, ['INBOX'], ['SNOOZED']);
    try {
      await gmail.modifyLabels(threadId, 'INBOX', 'SNOOZED');
    } catch (e: any) {
      cache.enqueuePendingAction('label', threadId, { add: 'INBOX', remove: 'SNOOZED' });
    }
  });

  ipcMain.handle(IPC.SNOOZE_LIST, async () => {
    return cache.getAllSnoozed();
  });

  // ── Cross-app ──
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

  // ── MCP ──
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

// ── Flush pending actions and outbox on reconnect ──

function setupOfflineFlush() {
  connectivity.on('online', async () => {
    console.log('[Kenaz] Online — flushing pending actions and outbox...');

    // Flush pending actions
    const actions = cache.getPendingActions();
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'archive':
            await gmail.archiveThread(action.threadId);
            break;
          case 'label':
            await gmail.modifyLabels(action.threadId, action.payload.add, action.payload.remove);
            break;
          case 'mark_read':
            await gmail.markAsRead(action.threadId);
            break;
        }
        cache.markActionSynced(action.id);
      } catch (e: any) {
        console.error(`[Kenaz] Failed to flush action ${action.id}:`, e.message);
        cache.markActionFailed(action.id);
      }
    }

    // Flush outbox
    const outboxItems = cache.getOutboxItems();
    for (const item of outboxItems) {
      if (item.status !== 'queued' && item.status !== 'failed') continue;
      try {
        cache.markOutboxSending(item.id);
        await gmail.sendEmail(item.payload);
        cache.markOutboxSent(item.id);
        console.log(`[Kenaz] Outbox item ${item.id} sent successfully`);

        // Notify user
        if (mainWindow && !mainWindow.isDestroyed()) {
          const to = item.payload.to.split(',')[0].trim();
          mainWindow.webContents.send('outbox:sent', { id: item.id, to });
        }
      } catch (e: any) {
        console.error(`[Kenaz] Failed to send outbox item ${item.id}:`, e.message);
        cache.markOutboxFailed(item.id, e.message);
      }
    }

    // Trigger sync to pick up any remote changes
    syncEngine.sync();
  });
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const isDefault = app.isDefaultProtocolClient('mailto');

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        {
          label: isDefault ? 'Default Mail App ✓' : 'Make Default Mail App',
          enabled: !isDefault,
          click: () => {
            app.setAsDefaultProtocolClient('mailto');
            buildAppMenu();
          },
        },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

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
    console.error('[Kenaz] Failed to install Futhark MCP:', e.message);
  }
}

app.whenReady().then(async () => {
  await initServices();
  registerIpcHandlers();
  setupOfflineFlush();
  buildAppMenu();
  createWindow();
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
  connectivity.stop();
  syncEngine.stop();
  cache.close();
});
