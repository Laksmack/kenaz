import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/types';
import type {
  Calendar,
  CalendarEvent,
  CreateEventInput,
  UpdateEventInput,
  ParsedEventInput,
  FreeBusyResponse,
  AppConfig,
  SyncState,
  PendingInvite,
  OverlayEvent,
} from '../shared/types';

interface UpdateState {
  status: string;
  version?: string;
  percent?: number;
  message?: string;
}

const api = {
  // Auth
  getAuthStatus: (): Promise<boolean> => ipcRenderer.invoke(IPC.AUTH_STATUS),
  startAuth: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke(IPC.AUTH_START),

  // Calendars
  getCalendars: (): Promise<Calendar[]> => ipcRenderer.invoke(IPC.CALENDARS_LIST),
  updateCalendar: (id: string, updates: Partial<Calendar>): Promise<Calendar> => ipcRenderer.invoke(IPC.CALENDAR_UPDATE, id, updates),

  // Events
  getEvents: (start: string, end: string, calendarId?: string): Promise<CalendarEvent[]> =>
    ipcRenderer.invoke(IPC.EVENTS_LIST, start, end, calendarId),
  getEvent: (id: string): Promise<CalendarEvent> => ipcRenderer.invoke(IPC.EVENT_GET, id),
  createEvent: (data: CreateEventInput): Promise<CalendarEvent> => ipcRenderer.invoke(IPC.EVENT_CREATE, data),
  updateEvent: (id: string, updates: UpdateEventInput): Promise<CalendarEvent> => ipcRenderer.invoke(IPC.EVENT_UPDATE, id, updates),
  deleteEvent: (id: string, scope?: 'single' | 'all'): Promise<void> => ipcRenderer.invoke(IPC.EVENT_DELETE, id, scope),
  rsvpEvent: (id: string, response: string, scope?: 'single' | 'all'): Promise<void> =>
    ipcRenderer.invoke(IPC.EVENT_RSVP, id, response, scope),

  // Agenda / Today
  getAgenda: (date?: string, days?: number): Promise<CalendarEvent[]> => ipcRenderer.invoke(IPC.AGENDA, date, days),
  getToday: (): Promise<CalendarEvent[]> => ipcRenderer.invoke(IPC.TODAY),

  // Free/Busy
  getFreeBusy: (calendarIds: string[], start: string, end: string): Promise<FreeBusyResponse> =>
    ipcRenderer.invoke(IPC.FREEBUSY, calendarIds, start, end),

  // Sync
  getSyncStatus: (): Promise<SyncState> => ipcRenderer.invoke(IPC.SYNC_STATUS),
  triggerSync: (opts?: { full?: boolean }): Promise<void> => ipcRenderer.invoke(IPC.SYNC_TRIGGER, opts),
  clearSyncQueue: (): Promise<number> => ipcRenderer.invoke(IPC.SYNC_CLEAR_QUEUE),

  // Parse
  parseEvent: (text: string): Promise<ParsedEventInput | null> => ipcRenderer.invoke(IPC.PARSE_EVENT, text),

  // Settings
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.SETTINGS_GET),
  setConfig: (updates: Partial<AppConfig>): Promise<void> => ipcRenderer.invoke(IPC.SETTINGS_SET, updates),

  // App
  setBadge: (count: number): Promise<void> => ipcRenderer.invoke(IPC.APP_SET_BADGE, count),
  notify: (title: string, body: string): Promise<void> => ipcRenderer.invoke(IPC.APP_NOTIFY, title, body),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.APP_OPEN_EXTERNAL, url),

  // Integration
  getDayPlan: (date?: string): Promise<{ events: CalendarEvent[]; tasks: unknown[]; date: string }> =>
    ipcRenderer.invoke(IPC.DAY_PLAN, date),
  getEventContext: (eventId: string): Promise<{ event: CalendarEvent; attendees: unknown[] }> =>
    ipcRenderer.invoke(IPC.EVENT_CONTEXT, eventId),

  // MCP
  getMcpStatus: (): Promise<{ enabled: boolean; installed: boolean; claudeDesktopConfig: unknown }> =>
    ipcRenderer.invoke(IPC.MCP_STATUS),

  // Pending Invites
  getPendingInvites: (): Promise<PendingInvite[]> => ipcRenderer.invoke(IPC.PENDING_INVITES),
  rsvpInvite: (threadId: string, response: string): Promise<{ success: boolean; response: string; eventId: string }> =>
    ipcRenderer.invoke(IPC.INVITE_RSVP, threadId, response),

  // Needs-action events (calendar events awaiting RSVP)
  getNeedsActionEvents: (): Promise<CalendarEvent[]> => ipcRenderer.invoke(IPC.NEEDS_ACTION_EVENTS),

  // Cross-app
  crossAppFetch: (url: string, options?: RequestInit): Promise<unknown> =>
    ipcRenderer.invoke(IPC.CROSS_APP_FETCH, url, options),

  // Overlay / "Meet with…"
  fetchOverlayEvents: (email: string, start: string, end: string): Promise<{ success: boolean; events: OverlayEvent[] }> =>
    ipcRenderer.invoke(IPC.OVERLAY_FETCH, email, start, end),
  checkOverlayAccess: (email: string): Promise<{ accessible: boolean }> =>
    ipcRenderer.invoke(IPC.OVERLAY_CHECK, email),
  searchContacts: (query: string): Promise<Array<{ email: string; display_name: string | null; count: number }>> =>
    ipcRenderer.invoke(IPC.OVERLAY_SEARCH_CONTACTS, query),

  // Update
  onUpdateState: (callback: (state: UpdateState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: UpdateState) => callback(state);
    ipcRenderer.on(IPC.UPDATE_STATE, handler);
    return () => { ipcRenderer.removeListener(IPC.UPDATE_STATE, handler); };
  },
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_CHECK),
  installUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_INSTALL),

  // Push events from main process
  onSyncChanged: (callback: (state: SyncState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: SyncState) => callback(state);
    ipcRenderer.on(IPC.SYNC_CHANGED, handler);
    return () => { ipcRenderer.removeListener(IPC.SYNC_CHANGED, handler); };
  },
  onEventsChanged: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC.EVENTS_CHANGED, handler);
    return () => { ipcRenderer.removeListener(IPC.EVENTS_CHANGED, handler); };
  },
  onConnectivityChanged: (callback: (online: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, online: boolean) => callback(online);
    ipcRenderer.on(IPC.CONNECTIVITY_CHANGED, handler);
    return () => { ipcRenderer.removeListener(IPC.CONNECTIVITY_CHANGED, handler); };
  },
};

contextBridge.exposeInMainWorld('dagaz', api);
