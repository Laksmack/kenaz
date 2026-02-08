import { contextBridge, ipcRenderer } from 'electron';

// IPC channel names - inlined to avoid import issues in preload context
const IPC = {
  GMAIL_AUTH: 'gmail:auth',
  GMAIL_AUTH_STATUS: 'gmail:auth-status',
  GMAIL_FETCH_THREADS: 'gmail:fetch-threads',
  GMAIL_FETCH_THREAD: 'gmail:fetch-thread',
  GMAIL_SEARCH: 'gmail:search',
  GMAIL_SEND: 'gmail:send',
  GMAIL_ARCHIVE: 'gmail:archive',
  GMAIL_LABEL: 'gmail:label',
  GMAIL_MARK_READ: 'gmail:mark-read',
  CALENDAR_TODAY: 'calendar:today',
  CALENDAR_RANGE: 'calendar:range',
  HUBSPOT_LOOKUP: 'hubspot:lookup',
  HUBSPOT_LOG: 'hubspot:log',
  APP_GET_CONFIG: 'app:get-config',
  APP_SET_CONFIG: 'app:set-config',
} as const;

const api = {
  // Gmail Auth
  gmailAuth: () => ipcRenderer.invoke(IPC.GMAIL_AUTH),
  gmailAuthStatus: () => ipcRenderer.invoke(IPC.GMAIL_AUTH_STATUS),

  // Gmail Operations
  fetchThreads: (query: string, maxResults?: number) =>
    ipcRenderer.invoke(IPC.GMAIL_FETCH_THREADS, query, maxResults),
  fetchThread: (threadId: string) =>
    ipcRenderer.invoke(IPC.GMAIL_FETCH_THREAD, threadId),
  search: (query: string) =>
    ipcRenderer.invoke(IPC.GMAIL_SEARCH, query),
  sendEmail: (payload: any) =>
    ipcRenderer.invoke(IPC.GMAIL_SEND, payload),
  archiveThread: (threadId: string) =>
    ipcRenderer.invoke(IPC.GMAIL_ARCHIVE, threadId),
  modifyLabels: (threadId: string, add: string | null, remove: string | null) =>
    ipcRenderer.invoke(IPC.GMAIL_LABEL, threadId, add, remove),
  markAsRead: (threadId: string) =>
    ipcRenderer.invoke(IPC.GMAIL_MARK_READ, threadId),

  // Calendar
  calendarToday: () => ipcRenderer.invoke(IPC.CALENDAR_TODAY),
  calendarRange: (timeMin: string, timeMax: string) =>
    ipcRenderer.invoke(IPC.CALENDAR_RANGE, timeMin, timeMax),

  // HubSpot
  hubspotLookup: (email: string) =>
    ipcRenderer.invoke(IPC.HUBSPOT_LOOKUP, email),
  hubspotLog: (payload: any) =>
    ipcRenderer.invoke(IPC.HUBSPOT_LOG, payload),

  // Config
  getConfig: () => ipcRenderer.invoke(IPC.APP_GET_CONFIG),
  setConfig: (updates: any) => ipcRenderer.invoke(IPC.APP_SET_CONFIG, updates),
};

contextBridge.exposeInMainWorld('kenaz', api);
