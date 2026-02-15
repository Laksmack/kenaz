import type { Task, TaskGroup, Tag, TaskStats, AppConfig } from '../shared/types';

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

      // Events
      onTasksChanged: (callback: () => void) => () => void;
    };
  }
}

export {};
