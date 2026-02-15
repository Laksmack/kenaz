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

export type NudgeType = 'follow_up' | 'reply';

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
  nudgeType?: NudgeType | null; // Gmail nudge: 'follow_up' (you sent last) or 'reply' (they sent last)
}

// ── Views ────────────────────────────────────────────────────

export type ViewType = string; // dynamic now — any view id or 'search'

export interface View {
  id: string;
  name: string;
  icon?: string; // emoji
  query: string; // Gmail search query
  sort?: 'date' | 'sender';
  color?: string;
  shortcut?: string;
}

export const DEFAULT_VIEWS: View[] = [
  { id: 'inbox', name: 'Inbox', icon: '📥', query: 'in:inbox', shortcut: 'gi' },
  { id: 'pending', name: 'Pending', icon: '⏳', query: 'label:PENDING', shortcut: 'gp' },
  { id: 'todo', name: 'Todo', icon: '✓', query: 'label:TODO', shortcut: 'gt' },
  { id: 'snoozed', name: 'Snoozed', icon: '⏰', query: 'label:SNOOZED' },
  { id: 'starred', name: 'Starred', icon: '⭐', query: 'is:starred', shortcut: 'gs' },
  { id: 'sent', name: 'Sent', icon: '📤', query: 'in:sent' },
  { id: 'drafts', name: 'Drafts', icon: '📝', query: 'in:drafts', shortcut: 'gd' },
  { id: 'all', name: 'All Mail', icon: '📬', query: '', shortcut: 'ga' },
];

// Backward compat alias
export interface ViewConfig {
  type: ViewType;
  label: string;
  query: string;
  shortcut?: string;
}

// Build VIEWS from DEFAULT_VIEWS for backward compat
export const VIEWS: ViewConfig[] = DEFAULT_VIEWS.map((v) => ({
  type: v.id,
  label: v.name,
  query: v.query,
  shortcut: v.shortcut,
}));

// ── Rules ────────────────────────────────────────────────────

export interface RuleCondition {
  field: 'sender' | 'to' | 'cc' | 'subject' | 'body' | 'has_attachment' | 'label';
  operator: 'contains' | 'equals' | 'matches' | 'not_contains';
  value: string;
}

export interface RuleAction {
  type: 'add_label' | 'remove_label' | 'archive' | 'mark_read';
  label?: string;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

// ── Compose ──────────────────────────────────────────────────

export interface ComposeData {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyMarkdown: string;
  bodyHtml?: string; // HTML content for rich editor mode
  replyToThreadId?: string;
  replyToMessageId?: string;
  hubspotDealId?: string;
  draftId?: string; // Gmail draft ID if resuming a draft
  signature: boolean;
  attachments?: EmailAttachment[];
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

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  base64: string; // base64-encoded file content
  size: number;   // bytes
}

export interface SendEmailPayload {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body_markdown: string;
  body_html?: string; // If present, sent directly (skip markdown conversion)
  reply_to_thread_id?: string;
  reply_to_message_id?: string;
  hubspot_deal_id?: string;
  signature?: boolean;
  skip_auto_bcc?: boolean;
  attachments?: EmailAttachment[];
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
  GMAIL_DOWNLOAD_ATTACHMENT: 'gmail:download-attachment',
  GMAIL_GET_ATTACHMENT_BASE64: 'gmail:get-attachment-base64',

  // Calendar
  CALENDAR_TODAY: 'calendar:today',
  CALENDAR_RANGE: 'calendar:range',
  CALENDAR_RSVP: 'calendar:rsvp',
  CALENDAR_FIND_EVENT: 'calendar:find-event',
  CALENDAR_LIST: 'calendar:list',

  // HubSpot
  HUBSPOT_LOOKUP: 'hubspot:lookup',
  HUBSPOT_LOG: 'hubspot:log',
  HUBSPOT_LOG_THREAD: 'hubspot:log-thread',
  HUBSPOT_SEARCH_DEALS: 'hubspot:search-deals',
  HUBSPOT_ASSOCIATE_DEAL: 'hubspot:associate-deal',

  // Drafts
  GMAIL_CREATE_DRAFT: 'gmail:create-draft',
  GMAIL_LIST_DRAFTS: 'gmail:list-drafts',
  GMAIL_GET_DRAFT: 'gmail:get-draft',
  GMAIL_DELETE_DRAFT: 'gmail:delete-draft',
  GMAIL_LIST_LABELS: 'gmail:list-labels',

  // File operations
  FILE_READ_BASE64: 'file:read-base64',

  // Badge & Notifications
  APP_SET_BADGE: 'app:set-badge',
  APP_NOTIFY: 'app:notify',

  // Views & Rules
  VIEWS_LIST: 'views:list',
  VIEWS_SAVE: 'views:save',
  RULES_LIST: 'rules:list',
  RULES_SAVE: 'rules:save',

  // App
  APP_GET_CONFIG: 'app:get-config',
  APP_SET_CONFIG: 'app:set-config',
  APP_USER_EMAIL: 'app:user-email',

  // Connectivity
  CONNECTIVITY_STATUS: 'connectivity:status',

  // Cache
  CACHE_GET_STATS: 'cache:get-stats',
  CACHE_CLEAR: 'cache:clear',
  CACHE_SEARCH_LOCAL: 'cache:search-local',

  // Outbox
  OUTBOX_LIST: 'outbox:list',
  OUTBOX_CANCEL: 'outbox:cancel',
  OUTBOX_RETRY: 'outbox:retry',

  // Contacts
  CONTACTS_SUGGEST: 'contacts:suggest',

  // Snooze
  SNOOZE_THREAD: 'snooze:thread',
  SNOOZE_CANCEL: 'snooze:cancel',
  SNOOZE_LIST: 'snooze:list',

  // MCP
  MCP_STATUS: 'mcp:status',
} as const;

// ── Config ───────────────────────────────────────────────────

export interface AppConfig {
  displayName: string; // User's display name (shown in email list for sent items)
  signature: string;
  hubspotToken: string;
  hubspotEnabled: boolean;
  hubspotPortalId: string;
  apiPort: number;
  apiEnabled: boolean;
  defaultView: ViewType;
  autoBccEnabled: boolean;
  autoBccAddress: string; // e.g. "crm@hubspot.com"
  autoBccExcludedDomains: string[]; // e.g. ["compscience.com"] — skip BCC for these domains
  archiveOnReply: boolean; // Automatically mark thread as done when replying
  composeMode: 'html' | 'markdown'; // Editor mode for compose window
  cacheEnabled: boolean; // Enable local SQLite email cache
  cacheMaxSizeMB: number; // Max cache size in MB (default 500)
  mcpEnabled: boolean; // Enable MCP server for Claude Desktop integration
  excludedCalendarIds: string[]; // Calendar IDs to hide from the widget
  theme: 'dark' | 'light' | 'system'; // App color theme
}

// ── Cache / Offline Types ───────────────────────────────────

export interface CacheStats {
  sizeBytes: number;
  threadCount: number;
  messageCount: number;
  lastSyncedAt: string | null;
  pendingActions: number;
  outboxCount: number;
}

export interface OutboxItem {
  id: number;
  payload: SendEmailPayload;
  createdAt: string;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  error: string | null;
  sentAt: string | null;
}

export const DEFAULT_CONFIG: AppConfig = {
  displayName: '',
  signature: `<p style="color:#666;font-size:13px;">Martin Stenkilde<br/>Director of Product & Business Development<br/>CompScience</p>`,
  hubspotToken: '',
  hubspotEnabled: false,
  hubspotPortalId: '',
  apiPort: 3141,
  apiEnabled: true,
  defaultView: 'inbox',
  autoBccEnabled: false,
  autoBccAddress: '',
  autoBccExcludedDomains: [],
  archiveOnReply: false,
  composeMode: 'html',
  cacheEnabled: true,
  cacheMaxSizeMB: 500,
  mcpEnabled: false,
  excludedCalendarIds: [],
  theme: 'dark',
};
