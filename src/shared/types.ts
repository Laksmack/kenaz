// ── Email Types ──────────────────────────────────────────────

export interface Email {
  id: string;
  threadId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  snippet: string;
  body: string; // HTML body
  bodyText: string; // plain text fallback
  date: string; // ISO string
  labels: string[];
  isUnread: boolean;
  hasAttachments: boolean;
  attachments: Attachment[];
}

export interface EmailAddress {
  name: string;
  email: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface EmailThread {
  id: string;
  subject: string;
  snippet: string;
  messages: Email[];
  lastDate: string;
  labels: string[];
  isUnread: boolean;
  from: EmailAddress; // most recent sender
  participants: EmailAddress[];
}

// ── Views ────────────────────────────────────────────────────

export type ViewType = 'inbox' | 'pending' | 'followup' | 'sent' | 'all' | 'search';

export interface ViewConfig {
  type: ViewType;
  label: string;
  query: string; // Gmail search query
  shortcut?: string;
}

export const VIEWS: ViewConfig[] = [
  { type: 'inbox', label: 'Inbox', query: 'in:inbox', shortcut: 'gi' },
  { type: 'pending', label: 'Pending', query: 'label:PENDING', shortcut: 'gp' },
  { type: 'followup', label: 'Follow Up', query: 'label:FOLLOWUP', shortcut: 'gf' },
  { type: 'sent', label: 'Sent', query: 'in:sent', shortcut: 'gs' },
  { type: 'all', label: 'All Mail', query: '', shortcut: 'ga' },
];

// ── Compose ──────────────────────────────────────────────────

export interface ComposeData {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyMarkdown: string;
  replyToThreadId?: string;
  replyToMessageId?: string;
  hubspotDealId?: string;
  signature: boolean;
}

// ── HubSpot Types ────────────────────────────────────────────

export interface HubSpotContact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  phone: string;
  lastActivity: string;
}

export interface HubSpotDeal {
  id: string;
  name: string;
  stage: string;
  amount: number;
  closeDate: string;
  pipeline: string;
}

export interface HubSpotActivity {
  id: string;
  type: 'note' | 'email' | 'meeting' | 'call';
  subject: string;
  body: string;
  timestamp: string;
}

export interface HubSpotContext {
  contact: HubSpotContact | null;
  deals: HubSpotDeal[];
  activities: HubSpotActivity[];
  loading: boolean;
  error: string | null;
}

// ── Calendar Types ───────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: string; // ISO string
  end: string; // ISO string
  allDay: boolean;
  hangoutLink: string;
  meetLink: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  attendees: { email: string; name: string; self: boolean; responseStatus: string }[];
  calendarColor: string;
}

// ── API Types ────────────────────────────────────────────────

export interface SendEmailPayload {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body_markdown: string;
  reply_to_thread_id?: string;
  reply_to_message_id?: string;
  hubspot_deal_id?: string;
  signature?: boolean;
}

// ── IPC Channels ─────────────────────────────────────────────

export const IPC = {
  // Gmail
  GMAIL_AUTH: 'gmail:auth',
  GMAIL_AUTH_STATUS: 'gmail:auth-status',
  GMAIL_FETCH_THREADS: 'gmail:fetch-threads',
  GMAIL_FETCH_THREAD: 'gmail:fetch-thread',
  GMAIL_SEARCH: 'gmail:search',
  GMAIL_SEND: 'gmail:send',
  GMAIL_ARCHIVE: 'gmail:archive',
  GMAIL_LABEL: 'gmail:label',
  GMAIL_MARK_READ: 'gmail:mark-read',

  // Calendar
  CALENDAR_TODAY: 'calendar:today',
  CALENDAR_RANGE: 'calendar:range',

  // HubSpot
  HUBSPOT_LOOKUP: 'hubspot:lookup',
  HUBSPOT_LOG: 'hubspot:log',

  // App
  APP_GET_CONFIG: 'app:get-config',
  APP_SET_CONFIG: 'app:set-config',
} as const;

// ── Config ───────────────────────────────────────────────────

export interface AppConfig {
  signature: string;
  hubspotToken: string;
  apiPort: number;
  defaultView: ViewType;
}

export const DEFAULT_CONFIG: AppConfig = {
  signature: `<p style="color:#666;font-size:13px;">Martin Stenkilde<br/>Director of Product & Business Development<br/>CompScience</p>`,
  hubspotToken: '',
  apiPort: 3141,
  defaultView: 'inbox',
};
