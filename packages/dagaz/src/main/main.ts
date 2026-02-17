import { app, BrowserWindow, ipcMain, shell, Notification, powerMonitor } from 'electron';
import path from 'path';
import * as chrono from 'chrono-node';

import { GoogleCalendarService } from './google-calendar';
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
  connectivity = new ConnectivityMonitor();
  connectivity.start();
  sync = new SyncEngine(google, cache, connectivity);

  const appConfig = config.get();
  if (appConfig.apiEnabled) {
    startApiServer(cache, google, sync, connectivity, appConfig.apiPort);
  }

  // Start sync if already authorized
  if (google.isAuthorized()) {
    sync.start();
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
      dagaz: {
        command: 'node',
        args: [getMcpServerPath()],
        env: {
          DAGAZ_API_PORT: String(apiPort),
        },
      },
    },
  };
}

// ── Badge Management ─────────────────────────────────────────

function updateDockBadge() {
  if (process.platform !== 'darwin' || !app.dock) return;
  const appConfig = config.get();
  if (!appConfig.dockBadgeEnabled) {
    app.dock.setBadge('');
    return;
  }
  const count = cache.getUpcomingEventCount(15);
  app.dock.setBadge(count > 0 ? count.toString() : '');
}

function startBadgeMonitor() {
  updateDockBadge();
  badgeInterval = setInterval(updateDockBadge, 60000);
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

  ipcMain.handle(IPC.SYNC_TRIGGER, async () => {
    await sync.incrementalSync();
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

function notifyEventsChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('events:changed');
  }
  updateDockBadge();
}

// ── App Lifecycle ────────────────────────────────────────────

app.whenReady().then(async () => {
  await initServices();
  registerIpcHandlers();
  createWindow();
  startBadgeMonitor();
  initDockIcon();

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
