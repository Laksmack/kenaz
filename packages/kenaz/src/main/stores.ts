import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { View, Rule } from '../shared/types';
import { DEFAULT_VIEWS } from '../shared/types';

// ── ViewStore ──────────────────────────────────────────────────

export class ViewStore {
  private filePath: string;
  private views: View[];

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'views.json');
    this.views = this.load();
  }

  private load(): View[] {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch (e) {
      console.error('Failed to load views:', e);
    }
    // Seed defaults on first run
    this.views = [...DEFAULT_VIEWS];
    this.save();
    return this.views;
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.views, null, 2));
    } catch (e) {
      console.error('Failed to save views:', e);
    }
  }

  list(): View[] {
    return [...this.views];
  }

  replace(views: View[]): View[] {
    this.views = views;
    this.save();
    return this.list();
  }

  create(view: View): View[] {
    this.views.push(view);
    this.save();
    return this.list();
  }

  update(id: string, updates: Partial<View>): View[] {
    this.views = this.views.map((v) => (v.id === id ? { ...v, ...updates } : v));
    this.save();
    return this.list();
  }

  remove(id: string): View[] {
    this.views = this.views.filter((v) => v.id !== id);
    this.save();
    return this.list();
  }
}

// ── RuleStore ──────────────────────────────────────────────────

export class RuleStore {
  private filePath: string;
  private rules: Rule[];

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'rules.json');
    this.rules = this.load();
  }

  private load(): Rule[] {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        if (Array.isArray(data)) return data;
      }
    } catch (e) {
      console.error('Failed to load rules:', e);
    }
    return [];
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.rules, null, 2));
    } catch (e) {
      console.error('Failed to save rules:', e);
    }
  }

  list(): Rule[] {
    return [...this.rules];
  }

  replace(rules: Rule[]): Rule[] {
    this.rules = rules;
    this.save();
    return this.list();
  }

  create(rule: Rule): Rule[] {
    this.rules.push(rule);
    this.save();
    return this.list();
  }

  update(id: string, updates: Partial<Rule>): Rule[] {
    this.rules = this.rules.map((r) => (r.id === id ? { ...r, ...updates } : r));
    this.save();
    return this.list();
  }

  remove(id: string): Rule[] {
    this.rules = this.rules.filter((r) => r.id !== id);
    this.save();
    return this.list();
  }
}
