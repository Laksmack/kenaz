import { contextBridge, ipcRenderer } from 'electron';

const IPC = {
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
  GROUPS_LIST: 'groups:list',
  GROUP_GET: 'group:get',
  TAGS_LIST: 'tags:list',
  APP_GET_CONFIG: 'app:get-config',
  APP_SET_CONFIG: 'app:set-config',
  APP_SET_BADGE: 'app:set-badge',
  APP_NOTIFY: 'app:notify',
  MCP_STATUS: 'mcp:status',
} as const;

const api = {
  // Tasks
  getToday: () => ipcRenderer.invoke(IPC.TASKS_TODAY),
  getInbox: () => ipcRenderer.invoke(IPC.TASKS_INBOX),
  getUpcoming: () => ipcRenderer.invoke(IPC.TASKS_UPCOMING),
  getTask: (id: string) => ipcRenderer.invoke(IPC.TASK_GET, id),
  createTask: (data: any) => ipcRenderer.invoke(IPC.TASK_CREATE, data),
  updateTask: (id: string, updates: any) => ipcRenderer.invoke(IPC.TASK_UPDATE, id, updates),
  deleteTask: (id: string) => ipcRenderer.invoke(IPC.TASK_DELETE, id),
  completeTask: (id: string) => ipcRenderer.invoke(IPC.TASK_COMPLETE, id),
  searchTasks: (query: string) => ipcRenderer.invoke(IPC.TASKS_SEARCH, query),
  getLogbook: (days?: number) => ipcRenderer.invoke(IPC.TASKS_LOGBOOK, days),
  getStats: () => ipcRenderer.invoke(IPC.TASKS_STATS),
  getTaggedTasks: (tagName: string) => ipcRenderer.invoke(IPC.TASKS_TAGGED, tagName),

  // Groups
  getGroups: () => ipcRenderer.invoke(IPC.GROUPS_LIST),
  getGroup: (name: string) => ipcRenderer.invoke(IPC.GROUP_GET, name),

  // Tags
  getTags: () => ipcRenderer.invoke(IPC.TAGS_LIST),

  // App
  getConfig: () => ipcRenderer.invoke(IPC.APP_GET_CONFIG),
  setConfig: (updates: any) => ipcRenderer.invoke(IPC.APP_SET_CONFIG, updates),
  setBadge: (count: number) => ipcRenderer.invoke(IPC.APP_SET_BADGE, count),
  notify: (title: string, body: string) => ipcRenderer.invoke(IPC.APP_NOTIFY, title, body),

  // MCP
  getMcpStatus: () => ipcRenderer.invoke(IPC.MCP_STATUS),

  // Push events
  onTasksChanged: (callback: () => void) => {
    ipcRenderer.on('tasks:changed', callback);
    return () => { ipcRenderer.removeListener('tasks:changed', callback); };
  },
};

contextBridge.exposeInMainWorld('raido', api);
