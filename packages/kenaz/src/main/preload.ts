import { contextBridge, ipcRenderer, webUtils } from 'electron';

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
  GMAIL_DOWNLOAD_ATTACHMENT: 'gmail:download-attachment',
  GMAIL_GET_ATTACHMENT_BASE64: 'gmail:get-attachment-base64',
  CALENDAR_TODAY: 'calendar:today',
  CALENDAR_RANGE: 'calendar:range',
  CALENDAR_RSVP: 'calendar:rsvp',
  CALENDAR_FIND_EVENT: 'calendar:find-event',
  CALENDAR_LIST: 'calendar:list',
  HUBSPOT_LOOKUP: 'hubspot:lookup',
  HUBSPOT_LOG: 'hubspot:log',
  HUBSPOT_LOG_THREAD: 'hubspot:log-thread',
  HUBSPOT_SEARCH_DEALS: 'hubspot:search-deals',
  HUBSPOT_ASSOCIATE_DEAL: 'hubspot:associate-deal',
  GMAIL_CREATE_DRAFT: 'gmail:create-draft',
  GMAIL_LIST_DRAFTS: 'gmail:list-drafts',
  GMAIL_GET_DRAFT: 'gmail:get-draft',
  GMAIL_DELETE_DRAFT: 'gmail:delete-draft',
  GMAIL_LIST_LABELS: 'gmail:list-labels',
  FILE_READ_BASE64: 'file:read-base64',
  APP_SET_BADGE: 'app:set-badge',
  APP_NOTIFY: 'app:notify',
  VIEWS_LIST: 'views:list',
  VIEWS_SAVE: 'views:save',
  RULES_LIST: 'rules:list',
  RULES_SAVE: 'rules:save',
  APP_GET_CONFIG: 'app:get-config',
  APP_SET_CONFIG: 'app:set-config',
  APP_USER_EMAIL: 'app:user-email',
  CONNECTIVITY_STATUS: 'connectivity:status',
  CACHE_GET_STATS: 'cache:get-stats',
  CACHE_CLEAR: 'cache:clear',
  CACHE_SEARCH_LOCAL: 'cache:search-local',
  OUTBOX_LIST: 'outbox:list',
  OUTBOX_CANCEL: 'outbox:cancel',
  OUTBOX_RETRY: 'outbox:retry',
  CONTACTS_SUGGEST: 'contacts:suggest',
  SNOOZE_THREAD: 'snooze:thread',
  SNOOZE_CANCEL: 'snooze:cancel',
  SNOOZE_LIST: 'snooze:list',
  MCP_STATUS: 'mcp:status',
} as const;

const api = {
  // Gmail Auth
  gmailAuth: () => ipcRenderer.invoke(IPC.GMAIL_AUTH),
  gmailAuthStatus: () => ipcRenderer.invoke(IPC.GMAIL_AUTH_STATUS),

  // Gmail Operations
  fetchThreads: (query: string, maxResults?: number, pageToken?: string) =>
    ipcRenderer.invoke(IPC.GMAIL_FETCH_THREADS, query, maxResults, pageToken),
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
  downloadAttachment: (messageId: string, attachmentId: string, filename: string) =>
    ipcRenderer.invoke(IPC.GMAIL_DOWNLOAD_ATTACHMENT, messageId, attachmentId, filename),
  getAttachmentBase64: (messageId: string, attachmentId: string) =>
    ipcRenderer.invoke(IPC.GMAIL_GET_ATTACHMENT_BASE64, messageId, attachmentId),

  // Drafts
  createDraft: (payload: any) =>
    ipcRenderer.invoke(IPC.GMAIL_CREATE_DRAFT, payload),
  listDrafts: () =>
    ipcRenderer.invoke(IPC.GMAIL_LIST_DRAFTS),
  getDraft: (draftId: string) =>
    ipcRenderer.invoke(IPC.GMAIL_GET_DRAFT, draftId),
  deleteDraft: (draftId: string) =>
    ipcRenderer.invoke(IPC.GMAIL_DELETE_DRAFT, draftId),
  listLabels: () =>
    ipcRenderer.invoke(IPC.GMAIL_LIST_LABELS),
  readFileBase64: (filePath: string) =>
    ipcRenderer.invoke(IPC.FILE_READ_BASE64, filePath),
  getFilePath: (file: File) => webUtils.getPathForFile(file),

  // Calendar
  calendarToday: () => ipcRenderer.invoke(IPC.CALENDAR_TODAY),
  calendarRange: (timeMin: string, timeMax: string) =>
    ipcRenderer.invoke(IPC.CALENDAR_RANGE, timeMin, timeMax),
  calendarRsvp: (eventId: string, response: 'accepted' | 'tentative' | 'declined', calendarId?: string) =>
    ipcRenderer.invoke(IPC.CALENDAR_RSVP, eventId, response, calendarId),
  calendarFindEvent: (iCalUID: string) =>
    ipcRenderer.invoke(IPC.CALENDAR_FIND_EVENT, iCalUID),
  listCalendars: () => ipcRenderer.invoke(IPC.CALENDAR_LIST),

  // HubSpot
  hubspotLookup: (email: string) =>
    ipcRenderer.invoke(IPC.HUBSPOT_LOOKUP, email),
  hubspotLog: (payload: any) =>
    ipcRenderer.invoke(IPC.HUBSPOT_LOG, payload),
  hubspotLogThread: (dealId: string, subject: string, body: string, senderEmail: string, recipientEmail: string) =>
    ipcRenderer.invoke(IPC.HUBSPOT_LOG_THREAD, dealId, subject, body, senderEmail, recipientEmail),
  hubspotSearchDeals: (query: string) =>
    ipcRenderer.invoke(IPC.HUBSPOT_SEARCH_DEALS, query),
  hubspotAssociateDeal: (contactId: string, dealId: string) =>
    ipcRenderer.invoke(IPC.HUBSPOT_ASSOCIATE_DEAL, contactId, dealId),

  // Badge & Notifications
  setBadge: (count: number) => ipcRenderer.invoke(IPC.APP_SET_BADGE, count),
  notify: (title: string, body: string) => ipcRenderer.invoke(IPC.APP_NOTIFY, title, body),

  // Views & Rules
  listViews: () => ipcRenderer.invoke(IPC.VIEWS_LIST),
  saveViews: (views: any[]) => ipcRenderer.invoke(IPC.VIEWS_SAVE, views),
  listRules: () => ipcRenderer.invoke(IPC.RULES_LIST),
  saveRules: (rules: any[]) => ipcRenderer.invoke(IPC.RULES_SAVE, rules),

  // Config
  getConfig: () => ipcRenderer.invoke(IPC.APP_GET_CONFIG),
  setConfig: (updates: any) => ipcRenderer.invoke(IPC.APP_SET_CONFIG, updates),
  getUserEmail: () => ipcRenderer.invoke(IPC.APP_USER_EMAIL),
  onRulesApplied: (callback: () => void) => {
    ipcRenderer.on('rules-applied', callback);
    return () => { ipcRenderer.removeListener('rules-applied', callback); };
  },

  // Connectivity
  getConnectivityStatus: () => ipcRenderer.invoke(IPC.CONNECTIVITY_STATUS),
  onConnectivityChange: (callback: (online: boolean) => void) => {
    const handler = (_event: any, online: boolean) => callback(online);
    ipcRenderer.on('connectivity:changed', handler);
    return () => { ipcRenderer.removeListener('connectivity:changed', handler); };
  },

  // Cache
  getCacheStats: () => ipcRenderer.invoke(IPC.CACHE_GET_STATS),
  clearCache: () => ipcRenderer.invoke(IPC.CACHE_CLEAR),
  searchLocal: (query: string) => ipcRenderer.invoke(IPC.CACHE_SEARCH_LOCAL, query),

  // Outbox
  listOutbox: () => ipcRenderer.invoke(IPC.OUTBOX_LIST),
  cancelOutbox: (id: number) => ipcRenderer.invoke(IPC.OUTBOX_CANCEL, id),
  retryOutbox: (id: number) => ipcRenderer.invoke(IPC.OUTBOX_RETRY, id),

  // Contacts
  suggestContacts: (prefix: string, limit?: number) => ipcRenderer.invoke(IPC.CONTACTS_SUGGEST, prefix, limit),

  // Snooze
  snoozeThread: (threadId: string, days: number) => ipcRenderer.invoke(IPC.SNOOZE_THREAD, threadId, days),
  cancelSnooze: (threadId: string) => ipcRenderer.invoke(IPC.SNOOZE_CANCEL, threadId),
  listSnoozed: () => ipcRenderer.invoke(IPC.SNOOZE_LIST),

  // MCP
  getMcpStatus: () => ipcRenderer.invoke(IPC.MCP_STATUS),

  // Push event listeners
  onThreadsUpdated: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('threads:updated', handler);
    return () => { ipcRenderer.removeListener('threads:updated', handler); };
  },
  onThreadUpdated: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('thread:updated', handler);
    return () => { ipcRenderer.removeListener('thread:updated', handler); };
  },
};

contextBridge.exposeInMainWorld('kenaz', api);
