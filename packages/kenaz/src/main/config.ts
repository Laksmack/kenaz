import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { AppConfig, GlobalConfig, AccountConfig } from '../shared/types';
import { DEFAULT_CONFIG, DEFAULT_GLOBAL_CONFIG, DEFAULT_ACCOUNT_CONFIG } from '../shared/types';

export class GlobalConfigStore {
  private configPath: string;
  private config: GlobalConfig;

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'global-config.json');
    this.config = this.load();
  }

  private load(): GlobalConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        return { ...DEFAULT_GLOBAL_CONFIG, ...data };
      }
    } catch (e) {
      console.error('Failed to load global config:', e);
    }
    return { ...DEFAULT_GLOBAL_CONFIG };
  }

  private save(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (e) {
      console.error('Failed to save global config:', e);
    }
  }

  get(): GlobalConfig {
    return { ...this.config };
  }

  update(updates: Partial<GlobalConfig>): GlobalConfig {
    this.config = { ...this.config, ...updates };
    this.save();
    return this.get();
  }
}

export class AccountConfigStore {
  private configPath: string;
  private config: AccountConfig;

  constructor(dataDir: string) {
    this.configPath = path.join(dataDir, 'config.json');
    this.config = this.load();
  }

  private load(): AccountConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        return { ...DEFAULT_ACCOUNT_CONFIG, ...data };
      }
    } catch (e) {
      console.error('Failed to load account config:', e);
    }
    return { ...DEFAULT_ACCOUNT_CONFIG };
  }

  private save(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (e) {
      console.error('Failed to save account config:', e);
    }
  }

  get(): AccountConfig {
    return { ...this.config };
  }

  update(updates: Partial<AccountConfig>): AccountConfig {
    this.config = { ...this.config, ...updates };
    this.save();
    return this.get();
  }
}

/**
 * Unified config view that merges GlobalConfig + AccountConfig.
 * The existing codebase (HubSpotService, GmailService, etc.) depends on
 * ConfigStore.get() returning an AppConfig. This adapter preserves that contract.
 */
export class ConfigStore {
  private global: GlobalConfigStore;
  private account: AccountConfigStore;

  constructor(global: GlobalConfigStore, account: AccountConfigStore) {
    this.global = global;
    this.account = account;
  }

  get(): AppConfig {
    return { ...this.global.get(), ...this.account.get() };
  }

  update(updates: Partial<AppConfig>): AppConfig {
    const globalKeys = new Set<string>(Object.keys(DEFAULT_GLOBAL_CONFIG));
    const globalUpdates: Record<string, any> = {};
    const accountUpdates: Record<string, any> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (globalKeys.has(key)) {
        globalUpdates[key] = value;
      } else {
        accountUpdates[key] = value;
      }
    }

    if (Object.keys(globalUpdates).length > 0) {
      this.global.update(globalUpdates as Partial<GlobalConfig>);
    }
    if (Object.keys(accountUpdates).length > 0) {
      this.account.update(accountUpdates as Partial<AccountConfig>);
    }

    return this.get();
  }
}
