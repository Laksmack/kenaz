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
  GMAIL_DOWNLOAD_ATTACHMENT: 'gmail:download-attachment',
  CALENDAR_TODAY: 'calendar:today',
  CALENDAR_RANGE: 'calendar:range',
  HUBSPOT_LOOKUP: 'hubspot:lookup',
  HUBSPOT_LOG: 'hubspot:log',
  HUBSPOT_LOG_THREAD: 'hubspot:log-thread',
  HUBSPOT_SEARCH_DEALS: 'hubspot:search-deals',
  HUBSPOT_ASSOCIATE_DEAL: 'hubspot:associate-deal',
  GMAIL_CREATE_DRAFT: 'gmail:create-draft',
  GMAIL_LIST_DRAFTS: 'gmail:list-drafts',
  GMAIL_GET_DRAFT: 'gmail:get-draft',
  GMAIL_DELETE_DRAFT: 'gmail:delete-draft',
  APP_GET_CONFIG: 'app:get-config',
  APP_SET_CONFIG: 'app:set-config',
  APP_USER_EMAIL: 'app:user-email',
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
  downloadAttachment: (messageId: string, attachmentId: string, filename: string) =>
    ipcRenderer.invoke(IPC.GMAIL_DOWNLOAD_ATTACHMENT, messageId, attachmentId, filename),

  // Drafts
  createDraft: (payload: any) =>
    ipcRenderer.invoke(IPC.GMAIL_CREATE_DRAFT, payload),
  listDrafts: () =>
    ipcRenderer.invoke(IPC.GMAIL_LIST_DRAFTS),
  getDraft: (draftId: string) =>
    ipcRenderer.invoke(IPC.GMAIL_GET_DRAFT, draftId),
  deleteDraft: (draftId: string) =>
    ipcRenderer.invoke(IPC.GMAIL_DELETE_DRAFT, draftId),

  // Calendar
  calendarToday: () => ipcRenderer.invoke(IPC.CALENDAR_TODAY),
  calendarRange: (timeMin: string, timeMax: string) =>
    ipcRenderer.invoke(IPC.CALENDAR_RANGE, timeMin, timeMax),

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

  // Config
  getConfig: () => ipcRenderer.invoke(IPC.APP_GET_CONFIG),
  setConfig: (updates: any) => ipcRenderer.invoke(IPC.APP_SET_CONFIG, updates),
  getUserEmail: () => ipcRenderer.invoke(IPC.APP_USER_EMAIL),
};

contextBridge.exposeInMainWorld('kenaz', api);
