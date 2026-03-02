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

interface DagazAPI {
  // Auth
  getAuthStatus(): Promise<boolean>;
  startAuth(): Promise<{ success: boolean; error?: string }>;

  // Calendars
  getCalendars(): Promise<Calendar[]>;
  updateCalendar(id: string, updates: Partial<Calendar>): Promise<Calendar>;

  // Events
  getEvents(start: string, end: string, calendarId?: string): Promise<CalendarEvent[]>;
  getEvent(id: string): Promise<CalendarEvent>;
  createEvent(data: CreateEventInput): Promise<CalendarEvent>;
  updateEvent(id: string, updates: UpdateEventInput): Promise<CalendarEvent>;
  deleteEvent(id: string, scope?: 'single' | 'all'): Promise<void>;
  rsvpEvent(id: string, response: string, scope?: 'single' | 'all'): Promise<void>;

  // Agenda / Today
  getAgenda(date?: string, days?: number): Promise<CalendarEvent[]>;
  getToday(): Promise<CalendarEvent[]>;

  // Free/Busy
  getFreeBusy(calendarIds: string[], start: string, end: string): Promise<FreeBusyResponse>;

  // Sync
  getSyncStatus(): Promise<SyncState>;
  triggerSync(opts?: { full?: boolean }): Promise<void>;
  clearSyncQueue(): Promise<number>;

  // Parse
  parseEvent(text: string): Promise<ParsedEventInput | null>;

  // Settings
  getConfig(): Promise<AppConfig>;
  setConfig(updates: Partial<AppConfig>): Promise<void>;

  // App
  setBadge(count: number): Promise<void>;
  notify(title: string, body: string): Promise<void>;
  openExternal(url: string): Promise<void>;

  // Integration
  getDayPlan(date?: string): Promise<{ events: CalendarEvent[]; tasks: unknown[]; date: string }>;
  getEventContext(eventId: string): Promise<{ event: CalendarEvent; attendees: unknown[] }>;

  // Pending Invites
  getPendingInvites(): Promise<PendingInvite[]>;
  rsvpInvite(threadId: string, response: string): Promise<{ success: boolean; response: string; eventId: string }>;

  // Needs-action events (calendar events awaiting RSVP)
  getNeedsActionEvents(): Promise<CalendarEvent[]>;

  // Cross-app
  crossAppFetch(url: string, options?: RequestInit): Promise<unknown>;

  // Overlay / "Meet with…"
  fetchOverlayEvents(email: string, start: string, end: string): Promise<{ success: boolean; events: OverlayEvent[] }>;
  checkOverlayAccess(email: string): Promise<{ accessible: boolean }>;
  searchContacts(query: string): Promise<Array<{ email: string; display_name: string | null; count: number }>>;

  // MCP
  getMcpStatus(): Promise<{ enabled: boolean; installed: boolean; claudeDesktopConfig: unknown }>;

  // Update
  onUpdateState(callback: (state: UpdateState) => void): () => void;
  checkForUpdates(): Promise<void>;
  installUpdate(): Promise<void>;

  // Push events
  onSyncChanged(callback: (state: SyncState) => void): () => void;
  onEventsChanged(callback: () => void): () => void;
  onConnectivityChanged(callback: (online: boolean) => void): () => void;
}

declare global {
  interface Window {
    dagaz: DagazAPI;
  }
}

export {};
