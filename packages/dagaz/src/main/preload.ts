import { contextBridge, ipcRenderer } from 'electron';

const IPC = {
  AUTH_STATUS: 'auth:status',
  AUTH_START: 'auth:start',
  CALENDARS_LIST: 'calendars:list',
  CALENDAR_UPDATE: 'calendar:update',
  EVENTS_LIST: 'events:list',
  EVENT_GET: 'event:get',
  EVENT_CREATE: 'event:create',
  EVENT_UPDATE: 'event:update',
  EVENT_DELETE: 'event:delete',
  EVENT_RSVP: 'event:rsvp',
  AGENDA: 'agenda',
  TODAY: 'today',
  FREEBUSY: 'freebusy',
  SYNC_STATUS: 'sync:status',
  SYNC_TRIGGER: 'sync:trigger',
  PARSE_EVENT: 'parse:event',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  APP_SET_BADGE: 'app:set-badge',
  APP_NOTIFY: 'app:notify',
  APP_OPEN_EXTERNAL: 'app:open-external',
  DAY_PLAN: 'day-plan',
  EVENT_CONTEXT: 'event:context',
  MCP_STATUS: 'mcp:status',
  OVERLAY_FETCH: 'overlay:fetch',
  OVERLAY_CHECK: 'overlay:check',
  OVERLAY_SEARCH_CONTACTS: 'overlay:search-contacts',
} as const;

const api = {
  // Auth
  getAuthStatus: () => ipcRenderer.invoke(IPC.AUTH_STATUS),
  startAuth: () => ipcRenderer.invoke(IPC.AUTH_START),

  // Calendars
  getCalendars: () => ipcRenderer.invoke(IPC.CALENDARS_LIST),
  updateCalendar: (id: string, updates: any) => ipcRenderer.invoke(IPC.CALENDAR_UPDATE, id, updates),

  // Events
  getEvents: (start: string, end: string, calendarId?: string) =>
    ipcRenderer.invoke(IPC.EVENTS_LIST, start, end, calendarId),
  getEvent: (id: string) => ipcRenderer.invoke(IPC.EVENT_GET, id),
  createEvent: (data: any) => ipcRenderer.invoke(IPC.EVENT_CREATE, data),
  updateEvent: (id: string, updates: any) => ipcRenderer.invoke(IPC.EVENT_UPDATE, id, updates),
  deleteEvent: (id: string) => ipcRenderer.invoke(IPC.EVENT_DELETE, id),
  rsvpEvent: (id: string, response: string) => ipcRenderer.invoke(IPC.EVENT_RSVP, id, response),

  // Agenda / Today
  getAgenda: (date?: string, days?: number) => ipcRenderer.invoke(IPC.AGENDA, date, days),
  getToday: () => ipcRenderer.invoke(IPC.TODAY),

  // Free/Busy
  getFreeBusy: (calendarIds: string[], start: string, end: string) =>
    ipcRenderer.invoke(IPC.FREEBUSY, calendarIds, start, end),

  // Sync
  getSyncStatus: () => ipcRenderer.invoke(IPC.SYNC_STATUS),
  triggerSync: (opts?: { full?: boolean }) => ipcRenderer.invoke(IPC.SYNC_TRIGGER, opts),

  // Parse
  parseEvent: (text: string) => ipcRenderer.invoke(IPC.PARSE_EVENT, text),

  // Settings
  getConfig: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  setConfig: (updates: any) => ipcRenderer.invoke(IPC.SETTINGS_SET, updates),

  // App
  setBadge: (count: number) => ipcRenderer.invoke(IPC.APP_SET_BADGE, count),
  notify: (title: string, body: string) => ipcRenderer.invoke(IPC.APP_NOTIFY, title, body),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.APP_OPEN_EXTERNAL, url),

  // Integration
  getDayPlan: (date?: string) => ipcRenderer.invoke(IPC.DAY_PLAN, date),
  getEventContext: (eventId: string) => ipcRenderer.invoke(IPC.EVENT_CONTEXT, eventId),

  // MCP
  getMcpStatus: () => ipcRenderer.invoke(IPC.MCP_STATUS),

  // Pending Invites
  getPendingInvites: () => ipcRenderer.invoke('pending-invites:list'),

  // Cross-app
  crossAppFetch: (url: string, options?: any) => ipcRenderer.invoke('cross-app:fetch', url, options),

  // Overlay / "Meet with…"
  fetchOverlayEvents: (email: string, start: string, end: string) =>
    ipcRenderer.invoke(IPC.OVERLAY_FETCH, email, start, end),
  checkOverlayAccess: (email: string) =>
    ipcRenderer.invoke(IPC.OVERLAY_CHECK, email),
  searchContacts: (query: string) =>
    ipcRenderer.invoke(IPC.OVERLAY_SEARCH_CONTACTS, query),

  // Push events from main process
  onSyncChanged: (callback: (state: any) => void) => {
    ipcRenderer.on('sync:changed', (_event, state) => callback(state));
    return () => { ipcRenderer.removeListener('sync:changed', callback as any); };
  },
  onConnectivityChanged: (callback: (online: boolean) => void) => {
    ipcRenderer.on('connectivity:changed', (_event, online) => callback(online));
    return () => { ipcRenderer.removeListener('connectivity:changed', callback as any); };
  },
};

contextBridge.exposeInMainWorld('dagaz', api);
