import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { AppConfig } from '../shared/types';
import { DEFAULT_CONFIG } from '../shared/types';

export class ConfigStore {
  private configPath: string;
  private config: AppConfig;

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'config.json');
    this.config = this.load();
  }

  private load(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        return { ...DEFAULT_CONFIG, ...data };
      }
    } catch (e) {
      console.error('[Dagaz] Failed to load config:', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  private save(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (e) {
      console.error('[Dagaz] Failed to save config:', e);
    }
  }

  get(): AppConfig {
    return { ...this.config };
  }

  update(updates: Partial<AppConfig>): AppConfig {
    this.config = { ...this.config, ...updates };
    this.save();
    return this.get();
  }
}
