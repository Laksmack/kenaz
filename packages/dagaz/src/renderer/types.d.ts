interface DagazAPI {
  // Auth
  getAuthStatus(): Promise<boolean>;
  startAuth(): Promise<{ success: boolean; error?: string }>;

  // Calendars
  getCalendars(): Promise<any[]>;
  updateCalendar(id: string, updates: any): Promise<any>;

  // Events
  getEvents(start: string, end: string, calendarId?: string): Promise<any[]>;
  getEvent(id: string): Promise<any>;
  createEvent(data: any): Promise<any>;
  updateEvent(id: string, updates: any): Promise<any>;
  deleteEvent(id: string, scope?: 'single' | 'all'): Promise<void>;
  rsvpEvent(id: string, response: string): Promise<void>;

  // Agenda / Today
  getAgenda(date?: string, days?: number): Promise<any[]>;
  getToday(): Promise<any[]>;

  // Free/Busy
  getFreeBusy(calendarIds: string[], start: string, end: string): Promise<any>;

  // Sync
  getSyncStatus(): Promise<{ status: string; lastSync: string | null; pendingCount: number }>;
  triggerSync(opts?: { full?: boolean }): Promise<any>;

  // Parse
  parseEvent(text: string): Promise<any>;

  // Settings
  getConfig(): Promise<any>;
  setConfig(updates: any): Promise<any>;

  // App
  setBadge(count: number): Promise<void>;
  notify(title: string, body: string): Promise<void>;
  openExternal(url: string): Promise<void>;

  // Integration
  getDayPlan(date?: string): Promise<{ events: any[]; tasks: any[]; date: string }>;
  getEventContext(eventId: string): Promise<any>;

  // Pending Invites
  getPendingInvites(): Promise<import('../shared/types').PendingInvite[]>;
  rsvpInvite(threadId: string, response: string): Promise<{ success: boolean; response: string; eventId: string }>;

  // Needs-action events (calendar events awaiting RSVP)
  getNeedsActionEvents(): Promise<import('../shared/types').CalendarEvent[]>;

  // Cross-app
  crossAppFetch(url: string, options?: any): Promise<any>;

  // Overlay / "Meet with…"
  fetchOverlayEvents(email: string, start: string, end: string): Promise<{ success: boolean; events: any[] }>;
  checkOverlayAccess(email: string): Promise<{ accessible: boolean }>;
  searchContacts(query: string): Promise<Array<{ email: string; display_name: string | null; count: number }>>;

  // MCP
  getMcpStatus(): Promise<any>;

  // Update
  onUpdateState(callback: (state: { status: string; version?: string; percent?: number; message?: string }) => void): () => void;
  checkForUpdates(): Promise<any>;
  installUpdate(): Promise<void>;

  // Push events
  onSyncChanged(callback: (state: any) => void): () => void;
  onConnectivityChanged(callback: (online: boolean) => void): () => void;
}

interface Window {
  dagaz: DagazAPI;
}
