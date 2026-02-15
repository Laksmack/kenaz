// ── Task Types ──────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  notes: string;
  status: 'open' | 'completed' | 'canceled';
  priority: 0 | 1 | 2 | 3; // 0=none, 1=low, 2=medium, 3=high
  due_date: string | null;
  when_date: string | null;
  completed_at: string | null;
  project_id: string | null;
  heading: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Cross-app linking
  kenaz_thread_id: string | null;
  hubspot_deal_id: string | null;
  vault_path: string | null;
  calendar_event_id: string | null;
  // Joined data
  tags?: string[];
}

export interface Project {
  id: string;
  title: string;
  notes: string;
  status: 'open' | 'completed' | 'canceled';
  area_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Computed
  task_count?: number;
  open_task_count?: number;
}

export interface Area {
  id: string;
  title: string;
  sort_order: number;
  projects?: Project[];
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
}

// ── IPC Channels ────────────────────────────────────────────

export const IPC = {
  // Tasks
  TASKS_TODAY: 'tasks:today',
  TASKS_INBOX: 'tasks:inbox',
  TASKS_UPCOMING: 'tasks:upcoming',
  TASKS_SOMEDAY: 'tasks:someday',
  TASK_GET: 'task:get',
  TASK_CREATE: 'task:create',
  TASK_UPDATE: 'task:update',
  TASK_DELETE: 'task:delete',
  TASK_COMPLETE: 'task:complete',
  TASKS_SEARCH: 'tasks:search',
  TASKS_LOGBOOK: 'tasks:logbook',
  TASKS_STATS: 'tasks:stats',
  TASKS_TAGGED: 'tasks:tagged',

  // Projects
  PROJECTS_LIST: 'projects:list',
  PROJECT_GET: 'project:get',
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_COMPLETE: 'project:complete',

  // Areas
  AREAS_LIST: 'areas:list',

  // Tags
  TAGS_LIST: 'tags:list',

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
}

export const DEFAULT_CONFIG: AppConfig = {
  apiEnabled: true,
  apiPort: 3142,
  mcpEnabled: true,
  theme: 'dark',
};

// ── Sidebar Views ───────────────────────────────────────────

export type ViewType = 'today' | 'inbox' | 'upcoming' | 'someday' | 'logbook' | 'project' | 'search';

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
  { id: 'someday', name: 'Someday', icon: '💭' },
  { id: 'logbook', name: 'Logbook', icon: '📖' },
];
