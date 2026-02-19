import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Section Types ─────────────────────────────────────────────

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

export interface EditorConfig {
  lineNumbers: 'auto' | 'on' | 'off';
}

export interface LaguzConfig {
  vaultPath: string;
  sections: Section[];
  editor?: EditorConfig;
}

// ── Defaults ──────────────────────────────────────────────────

const CONFIG_DIR = path.join(os.homedir(), '.laguz');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: LaguzConfig = {
  vaultPath: '~/vault',
  sections: [
    { id: 'scratch', type: 'scratch', label: 'Scratch', enabled: true },
    { id: 'vault', type: 'vault', label: 'Vault', enabled: true },
    {
      id: 'accounts',
      type: 'grouped',
      label: 'Accounts',
      path: 'customer management',
      icon: '🏢',
      enabled: true,
    },
  ],
};

// ── Manager ───────────────────────────────────────────────────

export class LaguzConfigManager {
  private config: LaguzConfig;

  constructor() {
    this.config = this.load();
  }

  private load(): LaguzConfig {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as LaguzConfig;
        if (parsed.sections && Array.isArray(parsed.sections)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[Laguz] Failed to load config, using defaults:', e);
    }
    this.persist(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  private persist(cfg: LaguzConfig): void {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Laguz] Failed to write config:', e);
    }
  }

  get(): LaguzConfig {
    return this.config;
  }

  save(newConfig: LaguzConfig): void {
    this.config = newConfig;
    this.persist(newConfig);
  }
}
