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
      calendarToday: () => Promise<any>;
      calendarRange: (timeMin: string, timeMax: string) => Promise<any>;
      hubspotLookup: (email: string) => Promise<any>;
      hubspotLog: (payload: any) => Promise<any>;
      getConfig: () => Promise<any>;
      setConfig: (updates: any) => Promise<any>;
    };
  }
}

export {};
