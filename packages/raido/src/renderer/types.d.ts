import type { Task, TaskGroup, Tag, TaskStats, AppConfig, TaskAttachment } from '../shared/types';

declare global {
  interface Window {
    raido: {
      // Tasks
      getToday: () => Promise<Task[]>;
      getInbox: () => Promise<Task[]>;
      getUpcoming: () => Promise<Task[]>;
      getTask: (id: string) => Promise<Task | null>;
      createTask: (data: Partial<Task>) => Promise<Task>;
      updateTask: (id: string, updates: Partial<Task>) => Promise<Task | null>;
      deleteTask: (id: string) => Promise<void>;
      completeTask: (id: string) => Promise<Task | null>;
      searchTasks: (query: string) => Promise<Task[]>;
      getLogbook: (days?: number) => Promise<Task[]>;
      getStats: () => Promise<TaskStats>;
      getTaggedTasks: (tagName: string) => Promise<Task[]>;

      // Attachments
      getAttachments: (taskId: string) => Promise<TaskAttachment[]>;
      openAttachment: (taskId: string, attachmentId: string) => Promise<void>;
      deleteAttachment: (taskId: string, attachmentId: string) => Promise<void>;

      // Groups
      getGroups: () => Promise<TaskGroup[]>;
      getGroup: (name: string) => Promise<Task[]>;

      // Tags
      getTags: () => Promise<Tag[]>;

      // App
      getConfig: () => Promise<AppConfig>;
      setConfig: (updates: Partial<AppConfig>) => Promise<AppConfig>;
      setBadge: (count: number) => Promise<void>;
      notify: (title: string, body: string) => Promise<void>;

      // MCP
      getMcpStatus: () => Promise<{ enabled: boolean; claudeDesktopConfig: any; serverPath: string }>;

      // Cross-app
      crossAppFetch: (url: string, options?: any) => Promise<any>;

      // Events
      onTasksChanged: (callback: () => void) => () => void;
    };
  }
}

export {};
