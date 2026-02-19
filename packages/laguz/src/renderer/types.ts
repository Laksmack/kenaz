export interface NoteSummary {
  id: string;
  path: string;
  title: string;
  type: string | null;
  subtype: string | null;
  company: string | null;
  date: string | null;
  created: string | null;
  modified: string | null;
  processed: number;
  word_count: number;
  tags: string[];
}

export interface NoteDetail extends NoteSummary {
  content: string;
  meta: Record<string, string>;
}

export type ViewType = 'scratch' | 'vault' | 'grouped' | 'flat';

// ── Config Types ──────────────────────────────────────────────

interface SectionBase {
  id: string;
  label: string;
  enabled: boolean;
}

interface BuiltinSection extends SectionBase {
  type: 'scratch' | 'vault';
}

interface GroupedSection extends SectionBase {
  type: 'grouped';
  path: string;
  icon: string;
}

interface FlatSection extends SectionBase {
  type: 'flat';
  path: string;
  icon: string;
}

export type Section = BuiltinSection | GroupedSection | FlatSection;

export interface LaguzConfig {
  vaultPath: string;
  sections: Section[];
}

export interface SelectedItem {
  sectionId: string;
  value: string;
}

declare global {
  interface Window {
    laguz: {
      platform: string;
      search: (params: { q?: string; type?: string; company?: string; since?: string; tags?: string }) => Promise<NoteSummary[]>;
      getNote: (path: string) => Promise<NoteDetail | null>;
      getMeetings: (company: string, since?: string) => Promise<NoteSummary[]>;
      getAccount: (path: string) => Promise<NoteSummary[]>;
      getSubfolders: (parentPath: string) => Promise<string[]>;
      getFolderNotes: (folderPath: string) => Promise<NoteSummary[]>;
      getUnprocessed: (since?: string) => Promise<NoteSummary[]>;
      writeNote: (path: string, content: string) => Promise<NoteDetail>;
      getCompanies: () => Promise<string[]>;
      getRecent: (limit?: number) => Promise<NoteSummary[]>;
      getConfig: () => Promise<LaguzConfig>;
      saveConfig: (config: LaguzConfig) => Promise<LaguzConfig>;
      crossAppFetch: (url: string, options?: any) => Promise<any>;
    };
  }
}
