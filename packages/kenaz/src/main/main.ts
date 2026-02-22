import { app, BrowserWindow, ipcMain, shell, Notification, Menu, MenuItem, dialog } from 'electron';
import path from 'path';

import { initAutoUpdater, getUpdateMenuItems } from '@futhark/core/lib/auto-updater';
import { startApiServer, type ServiceResolver } from './api-server';
import { GlobalConfigStore } from './config';
import { ConnectivityMonitor } from './connectivity';
import { AccountManager } from './account-manager';
import { migrateToMultiAccount } from './migrate-accounts';
import { applyRules } from './rule-engine';
import { IPC } from '../shared/types';
import type { SendEmailPayload, View, Rule } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let accountManager: AccountManager;
let globalConfig: GlobalConfigStore;
let connectivity: ConnectivityMonitor;

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
    accountManager.setMainWindow(null);
  });

  accountManager.setMainWindow(mainWindow);
}

async function initServices() {
  // Run migration before anything else
  await migrateToMultiAccount();

  globalConfig = new GlobalConfigStore();
  connectivity = new ConnectivityMonitor();
  connectivity.start();

  accountManager = new AccountManager(globalConfig, connectivity);
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

/** Convenience: get services for the active account, throw if none. */
function active() {
  const svc = accountManager.getActiveServices();
  if (!svc) throw new Error('No active account');
  return svc;
}

function registerIpcHandlers() {
  // ── Accounts ──
  ipcMain.handle(IPC.ACCOUNTS_LIST, async () => {
    return accountManager.listAccounts();
  });

  ipcMain.handle(IPC.ACCOUNTS_ACTIVE, async () => {
    return accountManager.getActiveEmail();
  });

  ipcMain.handle(IPC.ACCOUNTS_ADD, async () => {
    return accountManager.addAccount();
  });

  ipcMain.handle(IPC.ACCOUNTS_REMOVE, async (_event, email: string) => {
    return accountManager.removeAccount(email);
  });

  ipcMain.handle(IPC.ACCOUNTS_SWITCH, async (_event, email: string) => {
    const ok = await accountManager.switchAccount(email);
    if (ok) {
      const svc = accountManager.getActiveServices();
      if (svc) {
        await svc.syncEngine.start();
      }
    }
    return ok;
  });

  // ── Gmail Auth ──
  ipcMain.handle(IPC.GMAIL_AUTH, async () => {
    if (!accountManager.hasAccounts()) {
      // First account — use addAccount flow
      return accountManager.addAccount();
    }
    // Re-authenticate the active account
    const svc = active();
    const result = await svc.gmail.authenticate();
    if (result.success) {
      const oauthClient = svc.gmail.getOAuth2Client();
      if (oauthClient) svc.calendar.setAuth(oauthClient);
      svc.syncEngine.start();
    }
    return result;
  });

  ipcMain.handle(IPC.GMAIL_AUTH_STATUS, async () => {
    const svc = accountManager.getActiveServices();
    if (!svc) return false;
    const isAuth = await svc.gmail.isAuthenticated();
    if (isAuth) {
      svc.syncEngine.start();
    }
    return isAuth;
  });

  // ── Gmail Operations (cache-first) ──
  ipcMain.handle(IPC.GMAIL_FETCH_THREADS, async (_event, query: string, maxResults: number = 50, pageToken?: string) => {
    const { gmail, cache, config, viewStore: _vs, ruleStore } = active();
    const appConfig = config.get();

    let cachedThreads: any[] = [];
    if (appConfig.cacheEnabled && !pageToken) {
      try {
        cachedThreads = cache.getThreadsByQuery(query, maxResults);
      } catch (e) {
        console.error('[Cache] Failed to read cache:', e);
      }
    }

    if (!connectivity.isOnline) {
      return { threads: cachedThreads, nextPageToken: undefined, fromCache: true };
    }

    try {
      const result = await withOfflineAwareness(() =>
        gmail.fetchThreads(query, maxResults, pageToken)
      );

      if (appConfig.cacheEnabled && result.threads.length > 0) {
        try {
          cache.upsertThreads(result.threads);
          for (const thread of result.threads) {
            if (thread.messages.length > 0) {
              cache.upsertMessages(thread.messages);
            }
          }

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

      applyRules(ruleStore, gmail, result.threads)
        .then((madeChanges) => {
          if (madeChanges && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('rules-applied');
          }
        })
        .catch((e) => console.error('[Rules] Failed to apply rules:', e));

      return result;
    } catch (e: any) {
      if (cachedThreads.length > 0) {
        console.log('[Kenaz] API failed, returning cached threads');
        return { threads: cachedThreads, nextPageToken: undefined, fromCache: true };
      }
      throw e;
    }
  });

  ipcMain.handle(IPC.GMAIL_FETCH_THREAD, async (_event, threadId: string) => {
    const { gmail, cache, config } = active();
    const appConfig = config.get();

    if (appConfig.cacheEnabled) {
      const cached = cache.getThread(threadId);
      if (cached && cached.messages.length > 0 && cached.messages[0].body) {
        if (connectivity.isOnline) {
          withOfflineAwareness(() => gmail.fetchThread(threadId))
            .then((fresh) => {
              if (fresh) {
                cache.upsertFullThread(fresh);
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('thread:updated', fresh);
                }
              }
            })
            .catch(() => {});
        }
        return cached;
      }
    }

    if (!connectivity.isOnline) {
      if (appConfig.cacheEnabled) {
        return cache.getThread(threadId);
      }
      return null;
    }

    try {
      const thread = await withOfflineAwareness(() => gmail.fetchThread(threadId));
      if (thread && appConfig.cacheEnabled) {
        try {
          cache.upsertFullThread(thread);
        } catch (e) {
          console.error('[Cache] Failed to cache thread:', e);
        }
      }
      return thread;
    } catch (e) {
      if (appConfig.cacheEnabled) {
        return cache.getThread(threadId);
      }
      throw e;
    }
  });

  ipcMain.handle(IPC.GMAIL_SEARCH, async (_event, query: string) => {
    const { gmail, cache, config } = active();
    const appConfig = config.get();

    let localResults: any[] = [];
    if (appConfig.cacheEnabled) {
      try {
        localResults = cache.searchLocal(query, 50);
      } catch {}
    }

    if (!connectivity.isOnline) {
      return localResults;
    }

    try {
      const result = await withOfflineAwareness(() => gmail.fetchThreads(query, 50));
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
      const apiIds = new Set(result.threads.map((t: any) => t.id));
      const uniqueLocal = localResults.filter(t => !apiIds.has(t.id));
      return [...result.threads, ...uniqueLocal];
    } catch {
      return localResults;
    }
  });

  ipcMain.handle(IPC.GMAIL_SEND, async (_event, payload: SendEmailPayload) => {
    const { gmail, hubspot, cache } = active();

    if (!connectivity.isOnline) {
      const outboxId = cache.enqueueOutbox(payload);
      return { queued: true, outboxId };
    }

    try {
      const result = await withOfflineAwareness(() => gmail.sendEmail(payload));
      if (payload.hubspot_deal_id && result.id) {
        try {
          await hubspot.logEmail(payload, result.id);
        } catch (e) {
          console.error('Failed to log to HubSpot:', e);
        }
      }
      try {
        const sentTo: Array<{ name: string; email: string }> = [];
        if (payload.to) sentTo.push(...payload.to.split(',').map(e => ({ name: '', email: e.trim() })));
        if (payload.cc) sentTo.push(...payload.cc.split(',').map(e => ({ name: '', email: e.trim() })));
        if (payload.bcc) sentTo.push(...payload.bcc.split(',').map(e => ({ name: '', email: e.trim() })));
        cache.recordContacts(sentTo, 3);
      } catch {}
      return result;
    } catch (e: any) {
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
    const { gmail, cache } = active();
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
    const { gmail, cache } = active();
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
    const { gmail, cache } = active();
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
    const { gmail } = active();
    const filePath = await gmail.downloadAttachment(messageId, attachmentId, filename);
    shell.openPath(filePath);
    return filePath;
  });

  ipcMain.handle(IPC.GMAIL_GET_ATTACHMENT_BASE64, async (_event, messageId: string, attachmentId: string) => {
    const { gmail } = active();
    const buffer = await gmail.getAttachmentBuffer(messageId, attachmentId);
    return buffer.toString('base64');
  });

  // ── Drafts ──
  ipcMain.handle(IPC.GMAIL_CREATE_DRAFT, async (_event, payload: any) => {
    return active().gmail.createDraft(payload);
  });

  ipcMain.handle(IPC.GMAIL_LIST_DRAFTS, async () => {
    return active().gmail.listDrafts();
  });

  ipcMain.handle(IPC.GMAIL_GET_DRAFT, async (_event, draftId: string) => {
    return active().gmail.getDraft(draftId);
  });

  ipcMain.handle(IPC.GMAIL_DELETE_DRAFT, async (_event, draftId: string) => {
    return active().gmail.deleteDraft(draftId);
  });

  ipcMain.handle(IPC.GMAIL_LIST_LABELS, async () => {
    return active().gmail.listLabels();
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
    const { calendar, config } = active();
    const appConfig = config.get();
    return calendar.getTodayEvents(appConfig.excludedCalendarIds || []);
  });

  ipcMain.handle(IPC.CALENDAR_RANGE, async (_event, timeMin: string, timeMax: string) => {
    const { calendar, config } = active();
    const appConfig = config.get();
    return calendar.getEventsInRange(timeMin, timeMax, appConfig.excludedCalendarIds || []);
  });

  ipcMain.handle(IPC.CALENDAR_RSVP, async (_event, eventId: string, response: 'accepted' | 'tentative' | 'declined', calendarId?: string) => {
    return active().calendar.rsvpEvent(eventId, response, calendarId || 'primary');
  });

  ipcMain.handle(IPC.CALENDAR_FIND_EVENT, async (_event, iCalUID: string) => {
    return active().calendar.findEventByICalUID(iCalUID);
  });

  ipcMain.handle(IPC.CALENDAR_LIST, async () => {
    return active().calendar.listCalendars();
  });

  // ── HubSpot ──
  ipcMain.handle(IPC.HUBSPOT_LOOKUP, async (_event, email: string) => {
    return active().hubspot.lookupContact(email);
  });

  ipcMain.handle(IPC.HUBSPOT_LOG, async (_event, payload: any) => {
    return active().hubspot.logEmail(payload, '');
  });

  ipcMain.handle(IPC.HUBSPOT_LOG_THREAD, async (_event, dealId: string, subject: string, body: string, senderEmail: string, recipientEmail: string) => {
    return active().hubspot.logThreadToDeal(dealId, subject, body, senderEmail, recipientEmail);
  });

  ipcMain.handle(IPC.HUBSPOT_SEARCH_DEALS, async (_event, query: string) => {
    return active().hubspot.searchDeals(query);
  });

  ipcMain.handle(IPC.HUBSPOT_ASSOCIATE_DEAL, async (_event, contactId: string, dealId: string) => {
    return active().hubspot.associateContactWithDeal(contactId, dealId);
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
    return active().viewStore.list();
  });

  ipcMain.handle(IPC.VIEWS_SAVE, async (_event, views: View[]) => {
    return active().viewStore.replace(views);
  });

  ipcMain.handle(IPC.RULES_LIST, async () => {
    return active().ruleStore.list();
  });

  ipcMain.handle(IPC.RULES_SAVE, async (_event, rules: Rule[]) => {
    return active().ruleStore.replace(rules);
  });

  // ── Config ──
  ipcMain.handle(IPC.APP_GET_CONFIG, async () => {
    const svc = accountManager.getActiveServices();
    if (!svc) return globalConfig.get();
    return svc.config.get();
  });

  ipcMain.handle(IPC.APP_SET_CONFIG, async (_event, updates: any) => {
    const svc = accountManager.getActiveServices();
    if (!svc) return globalConfig.update(updates);
    return svc.config.update(updates);
  });

  ipcMain.handle(IPC.APP_USER_EMAIL, async () => {
    const svc = accountManager.getActiveServices();
    if (!svc) return '';
    return svc.gmail.getUserEmail();
  });

  // ── Connectivity ──
  ipcMain.handle(IPC.CONNECTIVITY_STATUS, async () => {
    const svc = accountManager.getActiveServices();
    return {
      online: connectivity.isOnline,
      pendingActions: svc ? svc.cache.getPendingActionCount() : 0,
      outboxCount: svc ? svc.cache.getOutboxCount() : 0,
    };
  });

  // ── Cache ──
  ipcMain.handle(IPC.CACHE_GET_STATS, async () => {
    return active().cache.getStats();
  });

  ipcMain.handle(IPC.CACHE_CLEAR, async () => {
    active().cache.clearCache();
  });

  ipcMain.handle(IPC.CACHE_SEARCH_LOCAL, async (_event, query: string) => {
    return active().cache.searchLocal(query, 50);
  });

  // ── Outbox ──
  ipcMain.handle(IPC.OUTBOX_LIST, async () => {
    return active().cache.getOutboxItems();
  });

  ipcMain.handle(IPC.OUTBOX_CANCEL, async (_event, id: number) => {
    active().cache.cancelOutboxItem(id);
  });

  ipcMain.handle(IPC.OUTBOX_RETRY, async (_event, id: number) => {
    const { gmail, cache } = active();
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
    return active().cache.suggestContacts(prefix, limit);
  });

  // ── Snooze ──
  ipcMain.handle(IPC.SNOOZE_THREAD, async (_event, threadId: string, days: number) => {
    const { gmail, cache } = active();
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + days);
    snoozeUntil.setHours(8, 0, 0, 0);
    const snoozeUntilStr = snoozeUntil.toISOString();

    const thread = cache.getThread(threadId);
    const originalLabels = thread?.labels || [];

    cache.snoozeThread(threadId, snoozeUntilStr, originalLabels);
    cache.updateThreadLabels(threadId, ['SNOOZED'], ['INBOX']);
    try {
      await gmail.modifyLabels(threadId, 'SNOOZED', 'INBOX');
    } catch (e: any) {
      cache.enqueuePendingAction('label', threadId, { add: 'SNOOZED', remove: 'INBOX' });
    }

    return { snoozeUntil: snoozeUntilStr };
  });

  ipcMain.handle(IPC.SNOOZE_CANCEL, async (_event, threadId: string) => {
    const { gmail, cache } = active();
    const snoozeInfo = cache.getSnoozedThread(threadId);
    if (!snoozeInfo) return;

    cache.cancelSnooze(threadId);
    cache.updateThreadLabels(threadId, ['INBOX'], ['SNOOZED']);
    try {
      await gmail.modifyLabels(threadId, 'INBOX', 'SNOOZED');
    } catch (e: any) {
      cache.enqueuePendingAction('label', threadId, { add: 'INBOX', remove: 'SNOOZED' });
    }
  });

  ipcMain.handle(IPC.SNOOZE_LIST, async () => {
    return active().cache.getAllSnoozed();
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
    const appConfig = accountManager.getActiveServices()?.config.get() || globalConfig.get();
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
      enabled: (appConfig as any).mcpEnabled ?? false,
      installed,
      claudeDesktopConfig: mcpConfig,
    };
  });
}

// ── Flush pending actions and outbox on reconnect ──

function setupOfflineFlush() {
  connectivity.on('online', async () => {
    console.log('[Kenaz] Online — flushing pending actions and outbox...');

    const svc = accountManager.getActiveServices();
    if (!svc) return;
    const { gmail, cache } = svc;

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

    const outboxItems = cache.getOutboxItems();
    for (const item of outboxItems) {
      if (item.status !== 'queued' && item.status !== 'failed') continue;
      try {
        cache.markOutboxSending(item.id);
        await gmail.sendEmail(item.payload);
        cache.markOutboxSent(item.id);
        console.log(`[Kenaz] Outbox item ${item.id} sent successfully`);

        if (mainWindow && !mainWindow.isDestroyed()) {
          const to = item.payload.to.split(',')[0].trim();
          mainWindow.webContents.send('outbox:sent', { id: item.id, to });
        }
      } catch (e: any) {
        console.error(`[Kenaz] Failed to send outbox item ${item.id}:`, e.message);
        cache.markOutboxFailed(item.id, e.message);
      }
    }

    svc.syncEngine.sync();
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
        ...getUpdateMenuItems(),
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
  initAutoUpdater(mainWindow!, buildAppMenu);
  installFutharkMcp();

  // Start the API server with a resolver that follows account switches
  const gc = globalConfig.get();
  if (gc.apiEnabled) {
    const svc = accountManager.getActiveServices();
    const resolver: ServiceResolver = {
      gmail: () => accountManager.getActiveServices()?.gmail ?? svc!.gmail,
      hubspot: () => accountManager.getActiveServices()?.hubspot ?? svc!.hubspot,
      calendar: () => accountManager.getActiveServices()?.calendar,
      configStore: () => accountManager.getActiveServices()?.config,
      viewStore: () => accountManager.getActiveServices()?.viewStore,
      ruleStore: () => accountManager.getActiveServices()?.ruleStore,
      cacheStore: () => accountManager.getActiveServices()?.cache,
    };
    if (svc) {
      startApiServer(
        svc.gmail, svc.hubspot, gc.apiPort,
        svc.viewStore, svc.ruleStore, svc.calendar, svc.config,
        () => mainWindow, svc.cache, resolver
      );
    }
  }

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
  accountManager.shutdown();
});
