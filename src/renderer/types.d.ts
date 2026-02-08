declare global {
  interface Window {
    kenaz: {
      gmailAuth: () => Promise<any>;
      gmailAuthStatus: () => Promise<boolean>;
      fetchThreads: (query: string, maxResults?: number) => Promise<any>;
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
      calendarToday: () => Promise<any>;
      calendarRange: (timeMin: string, timeMax: string) => Promise<any>;
      calendarRsvp: (eventId: string, response: 'accepted' | 'tentative' | 'declined', calendarId?: string) => Promise<{ success: boolean; status: string }>;
      calendarFindEvent: (iCalUID: string) => Promise<string | null>;
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
      downloadAttachment: (messageId: string, attachmentId: string, filename: string) => Promise<string>;
    };
  }
}

export {};
