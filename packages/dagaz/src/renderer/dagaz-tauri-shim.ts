// Tauri-mode shim for window.dagaz (see Laguz/Raidō shims for rationale).
// Fetch-backed bridge to the Dagaz Express API on :13143 when Electron's
// preload is absent. Never clobbers Electron.

const API_BASE = 'http://localhost:13143';

function q(params: Record<string, unknown>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

async function jget<T = any>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}${q(params)}`);
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function jsend<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

function notImpl(method: string) {
  return (..._args: unknown[]) => {
    console.warn(`[dagaz-tauri-shim] ${method}() not implemented in Tauri mode`);
    return Promise.resolve(null);
  };
}

const enc = encodeURIComponent;

const SHIM_MARKER = '__dagazTauriShimInstalled';
if (typeof (window as any).dagaz === 'undefined' || (window as any)[SHIM_MARKER]) {
  console.log('[dagaz-tauri-shim] installing fetch-backed window.dagaz (Tauri mode)');
  (window as any)[SHIM_MARKER] = true;

  (window as any).dagaz = {
    // ── Auth ──
    getAuthStatus: () => jget('/api/auth/status').then((r: any) => r.authorized ?? false),
    startAuth: () => jsend('POST', '/api/auth/start'),

    // ── Calendars ──
    getCalendars: () => jget('/api/calendars').then((r: any) => r.calendars ?? r),
    updateCalendar: (id: string, updates: unknown) => jsend('PUT', `/api/calendars/${enc(id)}`, updates),

    // ── Events ──
    getEvents: (start: string, end: string, calendarId?: string) =>
      jget('/api/events', { start, end, calendarId }).then((r: any) => r.events ?? r),
    searchEvents: notImpl('searchEvents'),
    getEvent: (id: string) => jget(`/api/events/${enc(id)}`),
    createEvent: (data: unknown) => jsend('POST', '/api/events', data),
    updateEvent: (id: string, updates: unknown, scope?: 'single' | 'all') =>
      jsend('PUT', `/api/events/${enc(id)}`, { ...(updates as object), scope }),
    deleteEvent: (id: string, scope?: 'single' | 'all') =>
      jsend('DELETE', `/api/events/${enc(id)}${q({ scope })}`),
    rsvpEvent: (id: string, response: string, scope?: 'single' | 'all') =>
      jsend('POST', `/api/events/${enc(id)}/rsvp`, { response, scope }),

    // ── Agenda / Today ──
    getAgenda: (date?: string, days?: number) =>
      jget('/api/agenda', { date, days }).then((r: any) => r.events ?? r),
    getToday: () => jget('/api/today').then((r: any) => r.events ?? r),

    // ── Free/Busy ──
    getFreeBusy: (calendarIds: string[], start: string, end: string) =>
      jget('/api/freebusy', { calendarIds: calendarIds.join(','), start, end }),
    findMeetingTime: (attendees: string, durationMinutes: number, start: string, end: string) =>
      jget('/api/find-meeting-time', { attendees, durationMinutes, start, end }),

    // ── Sync ──
    getSyncStatus: () => jget('/api/sync/status'),
    triggerSync: (opts?: { full?: boolean }) => jsend('POST', '/api/sync/trigger', opts ?? {}),
    clearSyncQueue: notImpl('clearSyncQueue'),

    // ── Parse ──
    parseEvent: (text: string) => jsend('POST', '/api/parse-event', { text }),

    // ── Config ──
    getConfig: () => jget('/api/config'),
    setConfig: (updates: unknown) => jsend('PUT', '/api/config', updates),

    // ── Integration ──
    getDayPlan: (date?: string) => jget('/api/day-plan', { date }),
    getEventContext: (eventId: string) => jget(`/api/events/${enc(eventId)}/context`),

    // ── Needs-action ──
    getNeedsActionEvents: () => jget('/api/needs-action').then((r: any) => r.events ?? r),

    // ── Cross-app ──
    crossAppFetch: (url: string, options?: RequestInit) =>
      fetch(url, options).then(async (r) => ({ ok: r.ok, status: r.status, text: await r.text() })),

    // ── Native-only / cross-app-dependent (stubbed) ──
    setBadge: notImpl('setBadge'),
    notify: notImpl('notify'),
    openExternal: (url: string) => { window.open(url, '_blank'); return Promise.resolve(); },
    exportBackup: notImpl('exportBackup'),
    revealDataFolder: notImpl('revealDataFolder'),
    getMcpStatus: () => Promise.resolve({ enabled: false, installed: false, claudeDesktopConfig: null }),
    getPendingInvites: () => Promise.resolve([]),
    rsvpInvite: notImpl('rsvpInvite'),
    fetchOverlayEvents: () => Promise.resolve({ success: false, events: [] }),
    checkOverlayAccess: () => Promise.resolve({ accessible: false }),
    searchContacts: () => Promise.resolve([]),

    // ── Updates / push (no-ops) ──
    onUpdateState: (_cb: (s: unknown) => void) => () => {},
    checkForUpdates: notImpl('checkForUpdates'),
    installUpdate: notImpl('installUpdate'),
    onSyncChanged: (_cb: (s: unknown) => void) => () => {},
    onEventsChanged: (_cb: () => void) => () => {},
    onConnectivityChanged: (_cb: (online: boolean) => void) => () => {},
  };
}

export {};
