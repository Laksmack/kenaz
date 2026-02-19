// ── Calendar Event Types ─────────────────────────────────────

export interface CalendarEvent {
  id: string;
  google_id: string | null;
  calendar_id: string;
  summary: string;
  description: string;
  location: string;
  start_time: string;
  end_time: string;
  start_date: string | null;
  end_date: string | null;
  all_day: boolean;
  time_zone: string | null;
  status: 'confirmed' | 'tentative' | 'cancelled';
  self_response: string | null;
  organizer_email: string | null;
  organizer_name: string | null;
  is_organizer: boolean;
  recurrence_rule: string | null;
  recurring_event_id: string | null;
  html_link: string | null;
  hangout_link: string | null;
  conference_data: ConferenceData | null;
  transparency: 'opaque' | 'transparent';
  visibility: string;
  color_id: string | null;
  reminders: ReminderOverride[] | null;
  etag: string | null;
  local_only: boolean;
  pending_action: 'create' | 'update' | 'delete' | null;
  pending_payload: string | null;
  created_at: string;
  updated_at: string;
  attachments?: EventAttachment[];
  attendees?: Attendee[];
  calendar_color?: string;
}

export interface EventAttachment {
  fileUrl: string;
  title: string;
  mimeType?: string;
  iconLink?: string;
  fileId?: string;
}

export interface ConferenceData {
  conferenceId?: string;
  conferenceSolution?: {
    name: string;
    iconUri?: string;
  };
  entryPoints?: Array<{
    entryPointType: string;
    uri: string;
    label?: string;
  }>;
}

export interface ReminderOverride {
  method: 'email' | 'popup';
  minutes: number;
}

export interface Calendar {
  id: string;
  summary: string;
  description: string | null;
  color_id: string | null;
  color_override: string | null;
  background_color: string | null;
  foreground_color: string | null;
  access_role: string;
  primary_calendar: boolean;
  visible: boolean;
  time_zone: string | null;
  sync_token: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attendee {
  id?: number;
  event_id: string;
  email: string;
  display_name: string | null;
  response_status: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  is_organizer: boolean;
  is_self: boolean;
}

export interface SyncQueueItem {
  id: number;
  event_id: string;
  calendar_id: string;
  action: 'create' | 'update' | 'delete' | 'rsvp';
  payload: string;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSync: string | null;
  pendingCount: number;
}

// ── Create/Update Input Types ───────────────────────────────

export interface CreateEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  all_day?: boolean;
  time_zone?: string;
  attendees?: string[];
  calendar_id?: string;
  add_conferencing?: boolean;
  recurrence?: string[];
  reminders?: ReminderOverride[];
  transparency?: 'opaque' | 'transparent';
  visibility?: string;
}

export interface UpdateEventInput {
  summary?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  all_day?: boolean;
  attendees?: string[];
  reminders?: ReminderOverride[];
  transparency?: 'opaque' | 'transparent';
  visibility?: string;
}

export interface ParsedEventInput {
  summary: string;
  start: string;
  end: string;
  location?: string;
  attendees?: string[];
  all_day?: boolean;
}

export interface FreeBusyResponse {
  calendars: Record<string, {
    busy: Array<{ start: string; end: string }>;
    errors?: Array<{ domain: string; reason: string }>;
  }>;
}

// ── Overlay / "Meet with…" Types ─────────────────────────────

export const OVERLAY_COLORS = [
  '#E8571F', // Kenaz orange
  '#D946EF', // Fuchsia
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#6366F1', // Indigo
  '#F43F5E', // Rose
] as const;

export interface OverlayPerson {
  email: string;
  name?: string;
  color: string;
  visible: boolean;
}

export interface OverlayEvent {
  id: string;
  summary: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  start_date?: string | null;
  end_date?: string | null;
  status: string;
  personEmail: string;
  personColor: string;
}

// ── View Types ──────────────────────────────────────────────

export type ViewType = 'week' | 'day' | 'month' | 'agenda';

// ── IPC Channels ────────────────────────────────────────────

export const IPC = {
  // Auth
  AUTH_STATUS: 'auth:status',
  AUTH_START: 'auth:start',

  // Calendars
  CALENDARS_LIST: 'calendars:list',
  CALENDAR_UPDATE: 'calendar:update',

  // Events
  EVENTS_LIST: 'events:list',
  EVENT_GET: 'event:get',
  EVENT_CREATE: 'event:create',
  EVENT_UPDATE: 'event:update',
  EVENT_DELETE: 'event:delete',
  EVENT_RSVP: 'event:rsvp',

  // Agenda / Today
  AGENDA: 'agenda',
  TODAY: 'today',

  // Free/Busy
  FREEBUSY: 'freebusy',

  // Sync
  SYNC_STATUS: 'sync:status',
  SYNC_TRIGGER: 'sync:trigger',

  // Parse
  PARSE_EVENT: 'parse:event',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // App
  APP_SET_BADGE: 'app:set-badge',
  APP_NOTIFY: 'app:notify',
  APP_OPEN_EXTERNAL: 'app:open-external',

  // Integration
  DAY_PLAN: 'day-plan',
  EVENT_CONTEXT: 'event:context',

  // MCP
  MCP_STATUS: 'mcp:status',

  // Overlay / "Meet with…"
  OVERLAY_FETCH: 'overlay:fetch',
  OVERLAY_CHECK: 'overlay:check',
  OVERLAY_SEARCH_CONTACTS: 'overlay:search-contacts',

  // Pending Invites (from Kenaz)
  PENDING_INVITES: 'pending-invites:list',
} as const;

// ── Pending Invites ─────────────────────────────────────────

export interface PendingInvite {
  threadId: string;
  subject: string;
  title: string;
  organizer: string;
  organizerEmail: string;
  startTime: string | null;
  endTime: string | null;
}

// ── Config ──────────────────────────────────────────────────

export interface AppConfig {
  apiEnabled: boolean;
  apiPort: number;
  mcpEnabled: boolean;
  theme: 'dark' | 'light' | 'system';
  defaultView: ViewType;
  weekViewDays: 5 | 7;
  workingHoursStart: number;
  workingHoursEnd: number;
  defaultCalendarId: string | null;
  notificationsEnabled: boolean;
  reminderMinutes: number;
  dockBadgeEnabled: boolean;
  pendingInviteCheckInterval: number;
  timeZones: string[];
  use24HourClock: boolean;
  dynamicDockIcon: boolean;
  dockEventIndicator: boolean;
  dockEventIndicatorMinutes: number;
  hideDeclinedEvents: boolean;
  overlayPeople: OverlayPerson[];
}

export const DEFAULT_CONFIG: AppConfig = {
  apiEnabled: true,
  apiPort: 3143,
  mcpEnabled: true,
  theme: 'dark',
  defaultView: 'week',
  weekViewDays: 5,
  workingHoursStart: 7,
  workingHoursEnd: 19,
  defaultCalendarId: null,
  notificationsEnabled: false,
  reminderMinutes: 15,
  dockBadgeEnabled: false,
  pendingInviteCheckInterval: 300000,
  timeZones: [],
  use24HourClock: false,
  dynamicDockIcon: false,
  dockEventIndicator: false,
  dockEventIndicatorMinutes: 5,
  hideDeclinedEvents: true,
  overlayPeople: [],
};
