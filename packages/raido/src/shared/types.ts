// ── Task Types ──────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  notes: string;
  status: 'open' | 'completed' | 'canceled';
  priority: 0 | 1 | 2 | 3;
  due_date: string | null;
  defer_until: string | null;
  completed_at: string | null;
  sort_order: number;
  recurrence: 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | null;
  created_at: string;
  updated_at: string;
  kenaz_thread_id: string | null;
  hubspot_deal_id: string | null;
  vault_path: string | null;
  calendar_event_id: string | null;
  tags?: string[];
  checklist?: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  sort_order: number;
  created_at: string;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  filename: string;
  mime_type: string;
  size: number;
  source: 'email' | 'upload' | 'vault';
  source_ref: string | null;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  body_html: string;
  created_at: string;
  updated_at: string;
}

export interface TaskGroup {
  name: string;
  count: number;
}

export interface Tag {
  id: string;
  name: string;
  count?: number;
}

// ── API Response Types ──────────────────────────────────────

export interface TaskStats {
  overdue: number;
  today: number;
  inbox: number;
  total_open: number;
  deferred: number;
}

// ── IPC Channels ────────────────────────────────────────────

export const IPC = {
  // Tasks
  TASKS_TODAY: 'tasks:today',
  TASKS_INBOX: 'tasks:inbox',
  TASKS_UPCOMING: 'tasks:upcoming',
  TASK_GET: 'task:get',
  TASK_CREATE: 'task:create',
  TASK_UPDATE: 'task:update',
  TASK_DELETE: 'task:delete',
  TASK_COMPLETE: 'task:complete',
  TASKS_SEARCH: 'tasks:search',
  TASKS_LOGBOOK: 'tasks:logbook',
  TASKS_STATS: 'tasks:stats',
  TASKS_TAGGED: 'tasks:tagged',
  TASKS_DEFERRED: 'tasks:deferred',

  // Checklist
  CHECKLIST_LIST: 'checklist:list',
  CHECKLIST_ADD: 'checklist:add',
  CHECKLIST_UPDATE: 'checklist:update',
  CHECKLIST_DELETE: 'checklist:delete',

  // Attachments
  ATTACHMENTS_LIST: 'attachments:list',
  ATTACHMENT_ADD: 'attachment:add',
  ATTACHMENT_OPEN: 'attachment:open',
  ATTACHMENT_DELETE: 'attachment:delete',

  // Groups
  GROUPS_LIST: 'groups:list',
  GROUP_GET: 'group:get',

  // Tags
  TAGS_LIST: 'tags:list',

  // Comments
  COMMENTS_LIST: 'comments:list',
  COMMENT_ADD: 'comment:add',
  COMMENT_UPDATE: 'comment:update',
  COMMENT_DELETE: 'comment:delete',

  // App
  APP_GET_CONFIG: 'app:get-config',
  APP_SET_CONFIG: 'app:set-config',
  APP_SET_BADGE: 'app:set-badge',
  APP_NOTIFY: 'app:notify',

  // MCP
  MCP_STATUS: 'mcp:status',
} as const;

// ── Config ──────────────────────────────────────────────────

export interface AppConfig {
  apiEnabled: boolean;
  apiPort: number;
  mcpEnabled: boolean;
  theme: 'dark' | 'light' | 'system';
  today_suggestion_pinned: boolean;
  hubspot_enabled: boolean;
  hubspot_portal_id: string;
  hubspot_owner_id: string;
  hubspot_pipeline: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  apiEnabled: true,
  apiPort: 3142,
  mcpEnabled: true,
  theme: 'dark',
  today_suggestion_pinned: false,
  hubspot_enabled: false,
  hubspot_portal_id: '',
  hubspot_owner_id: '',
  hubspot_pipeline: 'default',
};

// ── Sidebar Views ───────────────────────────────────────────

export type ViewType = 'today' | 'inbox' | 'upcoming' | 'logbook' | 'deferred' | 'pipeline' | 'group' | 'search';

export interface SidebarItem {
  id: ViewType | string;
  name: string;
  icon: string;
  count?: number;
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'today', name: 'Today', icon: '☀️' },
  { id: 'inbox', name: 'Inbox', icon: '📥' },
  { id: 'upcoming', name: 'Upcoming', icon: '📅' },
  { id: 'logbook', name: 'Logbook', icon: '📖' },
];

// ── Helpers ─────────────────────────────────────────────────

export function extractGroup(title: string): string | null {
  const match = title.match(/^\[([^\]]+)\]/);
  return match ? match[1] : null;
}
