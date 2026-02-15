declare global {
  interface Window {
    kenaz: {
      gmailAuth: () => Promise<any>;
      gmailAuthStatus: () => Promise<boolean>;
      fetchThreads: (query: string, maxResults?: number, pageToken?: string) => Promise<{ threads: any[]; nextPageToken?: string }>;
      fetchThread: (threadId: string) => Promise<any>;
      search: (query: string) => Promise<any>;
      sendEmail: (payload: any) => Promise<any>;
      archiveThread: (threadId: string) => Promise<void>;
      modifyLabels: (threadId: string, add: string | null, remove: string | null) => Promise<void>;
      markAsRead: (threadId: string) => Promise<void>;
      createDraft: (payload: any) => Promise<string>;
      listDrafts: () => Promise<any[]>;
      getDraft: (draftId: string) => Promise<any>;
      deleteDraft: (draftId: string) => Promise<void>;
      listLabels: () => Promise<Array<{ id: string; name: string; type: string }>>;
      readFileBase64: (filePath: string) => Promise<{ base64: string; mimeType: string; size: number; filename: string }>;
      calendarToday: () => Promise<any>;
      calendarRange: (timeMin: string, timeMax: string) => Promise<any>;
      calendarRsvp: (eventId: string, response: 'accepted' | 'tentative' | 'declined', calendarId?: string) => Promise<{ success: boolean; status: string }>;
      calendarFindEvent: (iCalUID: string) => Promise<string | null>;
      listCalendars: () => Promise<Array<{ id: string; name: string; color: string }>>;
      hubspotLookup: (email: string) => Promise<any>;
      hubspotLog: (payload: any) => Promise<any>;
      hubspotLogThread: (dealId: string, subject: string, body: string, senderEmail: string, recipientEmail: string) => Promise<{ success: boolean; error?: string }>;
      hubspotSearchDeals: (query: string) => Promise<any[]>;
      hubspotAssociateDeal: (contactId: string, dealId: string) => Promise<{ success: boolean; error?: string }>;
      setBadge: (count: number) => Promise<void>;
      notify: (title: string, body: string) => Promise<void>;
      listViews: () => Promise<any[]>;
      saveViews: (views: any[]) => Promise<any[]>;
      listRules: () => Promise<any[]>;
      saveRules: (rules: any[]) => Promise<any[]>;
      getConfig: () => Promise<any>;
      setConfig: (updates: any) => Promise<any>;
      getUserEmail: () => Promise<string>;
      onRulesApplied: (callback: () => void) => () => void;
      downloadAttachment: (messageId: string, attachmentId: string, filename: string) => Promise<string>;
      getAttachmentBase64: (messageId: string, attachmentId: string) => Promise<string>;

      // Connectivity
      getConnectivityStatus: () => Promise<{ online: boolean; pendingActions: number; outboxCount: number }>;
      onConnectivityChange: (callback: (online: boolean) => void) => () => void;

      // Cache
      getCacheStats: () => Promise<import('@shared/types').CacheStats>;
      clearCache: () => Promise<void>;
      searchLocal: (query: string) => Promise<any[]>;

      // Outbox
      listOutbox: () => Promise<import('@shared/types').OutboxItem[]>;
      cancelOutbox: (id: number) => Promise<void>;
      retryOutbox: (id: number) => Promise<void>;

      // Contacts
      suggestContacts: (prefix: string, limit?: number) => Promise<Array<{ email: string; name: string; frequency: number }>>;

      // Snooze
      snoozeThread: (threadId: string, days: number) => Promise<{ snoozeUntil: string }>;
      cancelSnooze: (threadId: string) => Promise<void>;
      listSnoozed: () => Promise<Array<{ threadId: string; snoozeUntil: string; snoozedAt: string }>>;

      // MCP
      getMcpStatus: () => Promise<{ enabled: boolean; claudeDesktopConfig: any; serverPath: string }>;
      // Push events
      onThreadsUpdated: (callback: (data: any) => void) => () => void;
      onThreadUpdated: (callback: (data: any) => void) => () => void;
    };
  }
}

export {};
