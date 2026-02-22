import type { Task, TaskGroup, Tag, TaskStats, AppConfig, TaskAttachment, ChecklistItem } from '../shared/types';

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
      completeTask: (id: string) => Promise<{ task: Task | null; spawned: Task | null }>;
      searchTasks: (query: string) => Promise<Task[]>;
      getLogbook: (days?: number) => Promise<Task[]>;
      getStats: () => Promise<TaskStats>;
      getTaggedTasks: (tagName: string) => Promise<Task[]>;

      // Checklist
      getChecklistItems: (taskId: string) => Promise<ChecklistItem[]>;
      addChecklistItem: (taskId: string, title: string) => Promise<ChecklistItem>;
      updateChecklistItem: (id: string, updates: Partial<ChecklistItem>) => Promise<ChecklistItem | null>;
      deleteChecklistItem: (id: string) => Promise<boolean>;

      // Attachments
      getAttachments: (taskId: string) => Promise<TaskAttachment[]>;
      addAttachment: (taskId: string) => Promise<TaskAttachment | null>;
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

      // Update
      onUpdateState: (callback: (state: { status: string; version?: string; percent?: number; message?: string }) => void) => () => void;
      checkForUpdates: () => Promise<any>;
      installUpdate: () => Promise<void>;

      // Events
      onTasksChanged: (callback: () => void) => () => void;
    };
  }
}

export {};
