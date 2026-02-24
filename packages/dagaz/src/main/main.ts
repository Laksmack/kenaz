import { app, BrowserWindow, ipcMain, shell, Notification, powerMonitor, dialog, Menu } from 'electron';
import path from 'path';
import * as chrono from 'chrono-node';

import { initAutoUpdater, getUpdateMenuItems } from '@futhark/core/lib/auto-updater';
import { GoogleCalendarService } from './google-calendar';
import { CalendlyService } from './calendly';
import { startApiServer } from './api-server';
import { ConfigStore } from './config';
import { CacheStore } from './cache-store';
import { ConnectivityMonitor } from './connectivity';
import { SyncEngine } from './sync-engine';
import {
  updateDockIcon, scheduleMidnightUpdate, handleSystemWake,
  startEventIndicatorCheck, stopEventIndicatorCheck, stopDockIcon,
} from './dock-icon';
import { IPC } from '../shared/types';
import type { CreateEventInput, UpdateEventInput } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let google: GoogleCalendarService;
let calendly: CalendlyService;
let config: ConfigStore;
let cache: CacheStore;
let connectivity: ConnectivityMonitor;
let sync: SyncEngine;
let badgeInterval: ReturnType<typeof setInterval> | null = null;
let hasUpcomingEvent = false;

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log(`[Dagaz] v${app.getVersion()} — ${isDev ? 'development' : 'production'}`);
  console.log('[Dagaz] __dirname:', __dirname);
  console.log('[Dagaz] preload path:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1000,
    minHeight: 650,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0d1520',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5175');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const htmlPath = path.join(__dirname, '../../renderer/index.html');
    console.log('[Dagaz] Loading HTML from:', htmlPath);
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.meta && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Dagaz] Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    connectivity.setMainWindow(null);
    sync.setMainWindow(null);
  });

  connectivity.setMainWindow(mainWindow);
  sync.setMainWindow(mainWindow);
}

async function initServices() {
  config = new ConfigStore();
  cache = new CacheStore();
  google = new GoogleCalendarService();
  calendly = new CalendlyService();
  connectivity = new ConnectivityMonitor();
  connectivity.start();
  sync = new SyncEngine(google, cache, connectivity);

  const appConfig = config.get();
  if (appConfig.calendlyApiKey) {
    calendly.configure(appConfig.calendlyApiKey);
  }
  if (appConfig.apiEnabled) {
    startApiServer(cache, google, sync, connectivity, appConfig.apiPort, calendly);
  }

  // Start sync if already authorized
  if (google.isAuthorized()) {
    sync.start();
  }
}

// ── MCP ─────────────────────────────────────────────────────
// Unified Futhark MCP server installed to ~/.futhark/ on startup.

// ── Pending Invites from Kenaz ──────────────────────────────

const KENAZ_BASE = 'http://localhost:3141';

interface KenazInvite {
  threadId: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  date: string;
}

function parseInviteSubject(subject: string): { title: string; dateStr: string | null } {
  const match = subject.match(/^(?:Updated )?[Ii]nvitation:\s*(.+?)\s+@\s+(.+)$/);
  if (match) return { title: match[1].trim(), dateStr: match[2].trim() };
  const simple = subject.match(/^(?:Updated )?[Ii]nvitation:\s*(.+)$/);
  if (simple) return { title: simple[1].trim(), dateStr: null };
  return { title: subject, dateStr: null };
}

async function getPendingInvites(): Promise<import('../shared/types').PendingInvite[]> {
  try {
    const url = `${KENAZ_BASE}/api/pending-invites`;
    console.log('[Badge] Fetching invites from Kenaz cache...');
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.warn(`[Badge] Kenaz returned ${res.status} ${res.statusText}`);
      return [];
    }
    const data = await res.json();
    const invites: KenazInvite[] = data.invites || [];
    console.log(`[Badge] Kenaz returned ${invites.length} pending invite(s)${invites.map(i => `\n  - "${i.subject?.slice(0, 60)}"`).join('')}`);

    return invites.map(inv => {
      const { title, dateStr } = parseInviteSubject(inv.subject);
      let startTime: string | null = null;
      let endTime: string | null = null;

      if (dateStr) {
        const parsed = chrono.parse(dateStr, new Date(), { forwardDate: true });
        if (parsed.length > 0) {
          startTime = parsed[0].start.date().toISOString();
          endTime = parsed[0].end
            ? parsed[0].end.date().toISOString()
            : new Date(parsed[0].start.date().getTime() + 60 * 60 * 1000).toISOString();
        }
      }

      return {
        threadId: inv.threadId,
        subject: inv.subject,
        title,
        organizer: inv.fromName,
        organizerEmail: inv.fromEmail,
        startTime,
        endTime,
      };
    });
  } catch (e) {
    console.error('[Badge] Failed to fetch invites from Kenaz:', e);
    return [];
  }
}

// ── Badge Management ─────────────────────────────────────────

async function updateDockBadge() {
  if (process.platform !== 'darwin' || !app.dock) return;
  const appConfig = config.get();
  if (!appConfig.dockBadgeEnabled) {
    app.dock.setBadge('');
    return;
  }
  // Primary: calendar events where self_response = 'needsAction' (authoritative)
  const needsActionCount = cache.getNeedsActionCount();
  // Secondary: Kenaz email invites (catches invites not yet synced to calendar)
  let kenazExtra = 0;
  try {
    const invites = await getPendingInvites();
    if (invites.length > needsActionCount) {
      kenazExtra = invites.length - needsActionCount;
    }
  } catch { /* Kenaz unavailable — ignore */ }
  const total = needsActionCount + kenazExtra;
  const badge = total > 0 ? total.toString() : '';
  console.log(`[Badge] Setting dock badge to "${badge || '(clear)'}" (${needsActionCount} needsAction + ${kenazExtra} extra from Kenaz)`);
  app.dock.setBadge(badge);
}

function startBadgeMonitor() {
  updateDockBadge();
  const interval = config.get().pendingInviteCheckInterval || 300000;
  badgeInterval = setInterval(updateDockBadge, interval);
}

// ── Dynamic Dock Icon ───────────────────────────────────────

function refreshDockIcon() {
  const appConfig = config.get();
  updateDockIcon({
    dynamic: appConfig.dynamicDockIcon,
    showEventDot: appConfig.dockEventIndicator && hasUpcomingEvent,
  });
}

function initDockIcon() {
  const appConfig = config.get();
  if (!appConfig.dynamicDockIcon) return;

  refreshDockIcon();

  scheduleMidnightUpdate(() => refreshDockIcon());

  if (appConfig.dockEventIndicator) {
    startEventIndicatorCheck(
      (mins) => cache.getUpcomingEventCount(mins),
      appConfig.dockEventIndicatorMinutes,
      (hasSoon) => {
        if (hasSoon !== hasUpcomingEvent) {
          hasUpcomingEvent = hasSoon;
          refreshDockIcon();
        }
      },
    );
  }
}

function reinitDockIconSettings() {
  const appConfig = config.get();
  stopEventIndicatorCheck();
  hasUpcomingEvent = false;

  refreshDockIcon();

  if (appConfig.dynamicDockIcon) {
    scheduleMidnightUpdate(() => refreshDockIcon());
    if (appConfig.dockEventIndicator) {
      startEventIndicatorCheck(
        (mins) => cache.getUpcomingEventCount(mins),
        appConfig.dockEventIndicatorMinutes,
        (hasSoon) => {
          if (hasSoon !== hasUpcomingEvent) {
            hasUpcomingEvent = hasSoon;
            refreshDockIcon();
          }
        },
      );
    }
  }
}

// ── NLP Parse Helper ─────────────────────────────────────────

function parseNaturalLanguage(text: string): {
  summary: string; start: string; end: string;
  location?: string; attendees?: string[];
} | null {
  const results = chrono.parse(text, new Date(), { forwardDate: true });
  if (results.length === 0) return null;

  const parsed = results[0];
  const start = parsed.start.date();
  const end = parsed.end ? parsed.end.date() : new Date(start.getTime() + 60 * 60 * 1000);

  let location: string | undefined;
  const atMatch = text.match(/\bat\s+([A-Z][^,]*?)(?:\s+(?:on|from|at|for)\s|$)/i);
  if (atMatch) {
    const potentialLocation = atMatch[1].trim();
    if (!chrono.parse(potentialLocation).length) {
      location = potentialLocation;
    }
  }

  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
  const attendees = text.match(emailRegex) || undefined;

  let summary = text;
  if (parsed.text) summary = summary.replace(parsed.text, '').trim();
  if (attendees) attendees.forEach(e => { summary = summary.replace(e, '').trim(); });
  if (location) summary = summary.replace(new RegExp(`\\bat\\s+${location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '').trim();
  summary = summary.replace(/\s*(with|for)\s*$/i, '').trim();
  summary = summary.replace(/^\s*(with|for)\s*/i, '').trim();
  if (!summary) summary = 'New Event';

  return { summary, start: start.toISOString(), end: end.toISOString(), location, attendees };
}

// ── IPC Handlers ─────────────────────────────────────────────

function registerIpcHandlers() {
  // Auth
  ipcMain.handle(IPC.AUTH_STATUS, async () => google.isAuthorized());

  ipcMain.handle(IPC.AUTH_START, async () => {
    const result = await google.authorize();
    if (result.success) {
      sync.start();
    }
    return result;
  });

  // Calendars
  ipcMain.handle(IPC.CALENDARS_LIST, async () => cache.getCalendars());

  ipcMain.handle(IPC.CALENDAR_UPDATE, async (_event, id: string, updates: any) => {
    if (updates.visible !== undefined) cache.updateCalendarVisibility(id, updates.visible);
    if (updates.color_override) cache.updateCalendarColor(id, updates.color_override);
    return cache.getCalendar(id);
  });

  // Events
  ipcMain.handle(IPC.EVENTS_LIST, async (_event, start: string, end: string, calendarId?: string) => {
    return cache.getEventsInRange(start, end, calendarId ? [calendarId] : undefined);
  });

  ipcMain.handle(IPC.EVENT_GET, async (_event, id: string) => cache.getEvent(id));

  ipcMain.handle(IPC.EVENT_CREATE, async (_event, data: CreateEventInput) => {
    const calendarId = data.calendar_id || cache.getPrimaryCalendarId() || 'primary';
    if (connectivity.isOnline && google.isAuthorized()) {
      try {
        const result = await google.createEvent(calendarId, data);
        const localId = cache.upsertEvent(result);
        if (result.attendees) {
          cache.upsertAttendees(localId, result.attendees.map(a => ({ ...a, event_id: localId })));
        }
        notifyEventsChanged();
        return cache.getEvent(localId);
      } catch (e: any) {
        console.error('[Dagaz] Create failed, saving locally:', e.message);
      }
    }
    const event = cache.createLocalEvent(data);
    cache.enqueueSync(event.id, calendarId, 'create', data);
    notifyEventsChanged();
    return event;
  });

  ipcMain.handle(IPC.EVENT_UPDATE, async (_event, id: string, updates: UpdateEventInput) => {
    const existing = cache.getEvent(id);
    if (!existing) return null;

    if (connectivity.isOnline && google.isAuthorized() && existing.google_id) {
      try {
        const result = await google.updateEvent(existing.calendar_id, existing.google_id, updates);
        cache.upsertEvent(result);
        if (result.attendees) {
          cache.upsertAttendees(id, result.attendees.map(a => ({ ...a, event_id: id })));
        }
        notifyEventsChanged();
        return cache.getEvent(id);
      } catch (e: any) {
        console.error('[Dagaz] Update failed, queueing:', e.message);
      }
    }

    cache.markEventPending(id, 'update', JSON.stringify(updates));
    if (existing.google_id) {
      cache.enqueueSync(existing.google_id, existing.calendar_id, 'update', updates);
    }
    notifyEventsChanged();
    return cache.getEvent(id);
  });

  ipcMain.handle(IPC.EVENT_DELETE, async (_event, id: string) => {
    const existing = cache.getEvent(id);
    if (!existing) return;

    if (connectivity.isOnline && google.isAuthorized() && existing.google_id) {
      try {
        await google.deleteEvent(existing.calendar_id, existing.google_id);
        cache.deleteEvent(id);
        notifyEventsChanged();
        return;
      } catch (e: any) {
        console.error('[Dagaz] Delete failed, queueing:', e.message);
      }
    }

    if (existing.google_id) {
      cache.markEventPending(id, 'delete');
      cache.enqueueSync(existing.google_id, existing.calendar_id, 'delete', {});
    } else {
      cache.deleteEvent(id);
    }
    notifyEventsChanged();
  });

  ipcMain.handle(IPC.EVENT_RSVP, async (_event, id: string, response: 'accepted' | 'declined' | 'tentative') => {
    const existing = cache.getEvent(id);
    if (!existing) return;

    if (connectivity.isOnline && google.isAuthorized() && existing.google_id) {
      try {
        await google.rsvpEvent(existing.calendar_id, existing.google_id, response);
        const updated = await google.getEvent(existing.calendar_id, existing.google_id);
        cache.upsertEvent(updated);
        notifyEventsChanged();
        return;
      } catch (e: any) {
        console.error('[Dagaz] RSVP failed, queueing:', e.message);
      }
    }

    if (existing.google_id) {
      cache.enqueueSync(existing.google_id, existing.calendar_id, 'rsvp', { response });
    }
  });

  // Agenda / Today
  ipcMain.handle(IPC.AGENDA, async (_event, date?: string, days?: number) => {
    return cache.getAgenda(date || new Date().toISOString().split('T')[0], days || 7);
  });

  ipcMain.handle(IPC.TODAY, async () => cache.getTodayEvents());

  // Free/Busy
  ipcMain.handle(IPC.FREEBUSY, async (_event, calendarIds: string[], start: string, end: string) => {
    return google.getFreeBusy(calendarIds, start, end);
  });

  // Sync
  ipcMain.handle(IPC.SYNC_STATUS, async () => ({
    status: sync.getStatus(),
    lastSync: sync.getLastSync(),
    pendingCount: sync.getPendingCount(),
  }));

  ipcMain.handle(IPC.SYNC_TRIGGER, async (_event, { full } = { full: false }) => {
    if (full) {
      await sync.fullSync();
    } else {
      await sync.incrementalSync();
    }
    return { status: sync.getStatus() };
  });

  // Parse
  ipcMain.handle(IPC.PARSE_EVENT, async (_event, text: string) => {
    return parseNaturalLanguage(text);
  });

  // Settings
  ipcMain.handle(IPC.SETTINGS_GET, async () => config.get());

  ipcMain.handle(IPC.SETTINGS_SET, async (_event, updates: any) => {
    const result = config.update(updates);
    if (
      updates.dynamicDockIcon !== undefined ||
      updates.dockEventIndicator !== undefined ||
      updates.dockEventIndicatorMinutes !== undefined
    ) {
      reinitDockIconSettings();
    }
    if (updates.dockBadgeEnabled !== undefined) {
      updateDockBadge();
    }
    if (updates.calendlyApiKey !== undefined) {
      calendly.configure(updates.calendlyApiKey);
    }
    return result;
  });

  // App
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

  ipcMain.handle(IPC.APP_OPEN_EXTERNAL, async (_event, url: string) => {
    shell.openExternal(url);
  });

  // Integration: Day Plan
  ipcMain.handle(IPC.DAY_PLAN, async (_event, date?: string) => {
    const d = date || new Date().toISOString().split('T')[0];
    const start = new Date(d);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const events = cache.getEventsInRange(start.toISOString(), end.toISOString());

    let tasks: any[] = [];
    try {
      const res = await fetch('http://localhost:3142/api/today', {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        tasks = data.tasks || [];
      }
    } catch {
      // Raidō not available
    }

    return { events, tasks, date: d };
  });

  // Integration: Event Context
  ipcMain.handle(IPC.EVENT_CONTEXT, async (_event, eventId: string) => {
    const ev = cache.getEvent(eventId);
    if (!ev) return null;

    const attendees = ev.attendees || [];
    const context: any = { event: ev, emailThreads: [], hubspotContacts: [] };

    for (const attendee of attendees.filter(a => !a.is_self).slice(0, 5)) {
      try {
        const res = await fetch(
          `http://localhost:3141/api/search?q=${encodeURIComponent(`from:${attendee.email}`)}`,
          { signal: AbortSignal.timeout(3000) },
        );
        if (res.ok) {
          const data = await res.json();
          const threads = (Array.isArray(data) ? data : data.threads || []).slice(0, 5);
          if (threads.length > 0) {
            context.emailThreads.push({
              attendee_email: attendee.email,
              attendee_name: attendee.display_name || attendee.email,
              threads,
            });
          }
        }
      } catch {}

      try {
        const res = await fetch(
          `http://localhost:3141/api/hubspot/contact/${encodeURIComponent(attendee.email)}`,
          { signal: AbortSignal.timeout(3000) },
        );
        if (res.ok) {
          const data = await res.json();
          if (data.contact) context.hubspotContacts.push({ attendee_email: attendee.email, ...data });
        }
      } catch {}
    }

    return context;
  });

  // Overlay / "Meet with…"
  ipcMain.handle(IPC.OVERLAY_FETCH, async (_event, email: string, start: string, end: string) => {
    if (!google.isAuthorized()) return { success: false, error: 'Not authorized' };
    try {
      const { events: rawEvents } = await google.listEvents(email, {
        timeMin: start,
        timeMax: end,
        singleEvents: true,
        maxResults: 250,
        noPaginate: true,
      });
      return {
        success: true,
        events: rawEvents.map((e: any) => ({
          id: e.google_id,
          summary: e.summary || 'Busy',
          start_time: e.start_time,
          end_time: e.end_time,
          all_day: e.all_day,
          start_date: e.start_date,
          end_date: e.end_date,
          status: e.status,
        })),
      };
    } catch (e: any) {
      // If we can't read their calendar, fall back to FreeBusy
      try {
        const fb = await google.getFreeBusy([email], start, end);
        const busyBlocks = fb.calendars[email]?.busy || [];
        return {
          success: true,
          events: busyBlocks.map((b: any, i: number) => ({
            id: `freebusy-${email}-${i}`,
            summary: 'Busy',
            start_time: b.start,
            end_time: b.end,
            all_day: false,
            status: 'confirmed',
          })),
          freeBusyFallback: true,
        };
      } catch (fbErr: any) {
        return { success: false, error: fbErr.message || 'Cannot access calendar' };
      }
    }
  });

  ipcMain.handle(IPC.OVERLAY_CHECK, async (_event, email: string) => {
    if (!google.isAuthorized()) return { accessible: false, error: 'Not authorized' };
    try {
      // Try to fetch just 1 event to verify access
      const now = new Date();
      const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      await google.listEvents(email, {
        timeMin: now.toISOString(),
        timeMax: weekLater.toISOString(),
        singleEvents: true,
        maxResults: 1,
        noPaginate: true,
      });
      return { accessible: true, fullAccess: true };
    } catch {
      // Try FreeBusy as fallback
      try {
        await google.getFreeBusy([email], new Date().toISOString(), new Date(Date.now() + 86400000).toISOString());
        return { accessible: true, fullAccess: false };
      } catch {
        return { accessible: false };
      }
    }
  });

  ipcMain.handle(IPC.OVERLAY_SEARCH_CONTACTS, async (_event, query: string) => {
    if (!query || query.length < 2) return [];
    return cache.searchContacts(query, 8);
  });

  // Pending Invites (from Kenaz)
  ipcMain.handle(IPC.PENDING_INVITES, async () => {
    return getPendingInvites();
  });

  // Needs-action events (from calendar DB — authoritative source)
  ipcMain.handle(IPC.NEEDS_ACTION_EVENTS, async () => {
    return cache.getNeedsActionEvents();
  });

  ipcMain.handle('invite:rsvp', async (_event, threadId: string) => {
    const url = `${KENAZ_BASE}/api/archive/${threadId}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Archive failed (${res.status})`);
    }
    updateDockBadge();
    return res.json();
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

function notifyEventsChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('events:changed');
  }
  updateDockBadge();
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
    console.error('[Dagaz] Failed to install Futhark MCP:', e.message);
  }
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        ...getUpdateMenuItems(),
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
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  await initServices();
  registerIpcHandlers();
  buildAppMenu();
  createWindow();
  initAutoUpdater(mainWindow!, buildAppMenu);
  startBadgeMonitor();
  initDockIcon();
  installFutharkMcp();

  powerMonitor.on('resume', () => {
    handleSystemWake(() => refreshDockIcon());
  });

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
  stopDockIcon();
  connectivity.stop();
  sync.stop();
  cache.close();
});
