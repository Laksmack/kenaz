import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import crypto from 'crypto';
import type { Task, Project, Area, Tag, TaskStats } from '../shared/types';

export class TaskStore {
  private db: Database.Database;

  constructor() {
    const dbPath = path.join(app.getPath('userData'), 'raido.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS areas (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        sort_order REAL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT DEFAULT '',
        status TEXT DEFAULT 'open' CHECK(status IN ('open', 'completed', 'canceled')),
        area_id TEXT,
        sort_order REAL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT DEFAULT '',
        status TEXT DEFAULT 'open' CHECK(status IN ('open', 'completed', 'canceled')),
        priority INTEGER DEFAULT 0 CHECK(priority BETWEEN 0 AND 3),
        due_date TEXT,
        when_date TEXT,
        completed_at TEXT,
        project_id TEXT,
        heading TEXT,
        sort_order REAL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        kenaz_thread_id TEXT,
        hubspot_deal_id TEXT,
        vault_path TEXT,
        calendar_event_id TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_tags (
        task_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (task_id, tag_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_when_date ON tasks(when_date);
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    `);
  }

  private genId(): string {
    return crypto.randomUUID();
  }

  private now(): string {
    return new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
  }

  private getTagsForTask(taskId: string): string[] {
    const rows = this.db.prepare(`
      SELECT t.name FROM tags t
      JOIN task_tags tt ON tt.tag_id = t.id
      WHERE tt.task_id = ?
    `).all(taskId) as { name: string }[];
    return rows.map(r => r.name);
  }

  private enrichTask(row: any): Task {
    return {
      ...row,
      tags: this.getTagsForTask(row.id),
    };
  }

  private setTaskTags(taskId: string, tagNames: string[]): void {
    // Remove existing tags
    this.db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId);

    for (const name of tagNames) {
      // Upsert the tag
      let tag = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: string } | undefined;
      if (!tag) {
        const tagId = this.genId();
        this.db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(tagId, name);
        tag = { id: tagId };
      }
      this.db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)').run(taskId, tag.id);
    }
  }

  // ── Task Queries ──────────────────────────────────────────

  getToday(): Task[] {
    const today = new Date().toISOString().split('T')[0];
    const rows = this.db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'open'
        AND (when_date <= ? OR (due_date < ? AND due_date IS NOT NULL))
      ORDER BY priority DESC, sort_order, created_at
    `).all(today, today) as any[];
    return rows.map(r => this.enrichTask(r));
  }

  getInbox(): Task[] {
    const rows = this.db.prepare(`
      SELECT * FROM tasks
      WHERE project_id IS NULL AND when_date IS NULL AND status = 'open'
      ORDER BY created_at DESC
    `).all() as any[];
    return rows.map(r => this.enrichTask(r));
  }

  getUpcoming(): Task[] {
    const today = new Date().toISOString().split('T')[0];
    const rows = this.db.prepare(`
      SELECT * FROM tasks
      WHERE when_date > ? AND status = 'open'
      ORDER BY when_date, sort_order
    `).all(today) as any[];
    return rows.map(r => this.enrichTask(r));
  }

  getSomeday(): Task[] {
    const rows = this.db.prepare(`
      SELECT * FROM tasks
      WHERE when_date IS NULL AND project_id IS NOT NULL AND status = 'open'
      ORDER BY sort_order, created_at
    `).all() as any[];
    return rows.map(r => this.enrichTask(r));
  }

  getTask(id: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.enrichTask(row);
  }

  createTask(data: {
    title: string;
    notes?: string;
    due_date?: string;
    when_date?: string;
    project_id?: string;
    priority?: number;
    tags?: string[];
    heading?: string;
    kenaz_thread_id?: string;
    hubspot_deal_id?: string;
    vault_path?: string;
    calendar_event_id?: string;
  }): Task {
    const id = this.genId();
    const now = this.now();
    this.db.prepare(`
      INSERT INTO tasks (id, title, notes, due_date, when_date, project_id, priority, heading,
                         kenaz_thread_id, hubspot_deal_id, vault_path, calendar_event_id,
                         created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.title,
      data.notes || '',
      data.due_date || null,
      data.when_date || null,
      data.project_id || null,
      data.priority || 0,
      data.heading || null,
      data.kenaz_thread_id || null,
      data.hubspot_deal_id || null,
      data.vault_path || null,
      data.calendar_event_id || null,
      now,
      now,
    );

    if (data.tags && data.tags.length > 0) {
      this.setTaskTags(id, data.tags);
    }

    return this.getTask(id)!;
  }

  updateTask(id: string, updates: Partial<{
    title: string;
    notes: string;
    due_date: string | null;
    when_date: string | null;
    project_id: string | null;
    priority: number;
    status: string;
    heading: string | null;
    sort_order: number;
    tags: string[];
    kenaz_thread_id: string | null;
    hubspot_deal_id: string | null;
    vault_path: string | null;
    calendar_event_id: string | null;
  }>): Task | null {
    const fields: string[] = [];
    const values: any[] = [];

    const allowedFields = [
      'title', 'notes', 'due_date', 'when_date', 'project_id',
      'priority', 'status', 'heading', 'sort_order',
      'kenaz_thread_id', 'hubspot_deal_id', 'vault_path', 'calendar_event_id',
    ];

    for (const field of allowedFields) {
      if (field in updates) {
        fields.push(`${field} = ?`);
        values.push((updates as any)[field]);
      }
    }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(this.now());
      values.push(id);

      this.db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    if (updates.tags) {
      this.setTaskTags(id, updates.tags);
    }

    return this.getTask(id);
  }

  completeTask(id: string): Task | null {
    const now = this.now();
    this.db.prepare(`
      UPDATE tasks SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?
    `).run(now, now, id);
    return this.getTask(id);
  }

  deleteTask(id: string): void {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }

  searchTasks(query: string): Task[] {
    const pattern = `%${query}%`;
    const rows = this.db.prepare(`
      SELECT * FROM tasks
      WHERE (title LIKE ? OR notes LIKE ?)
      ORDER BY
        CASE WHEN status = 'open' THEN 0 ELSE 1 END,
        updated_at DESC
      LIMIT 50
    `).all(pattern, pattern) as any[];
    return rows.map(r => this.enrichTask(r));
  }

  getLogbook(days: number = 7): Task[] {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const rows = this.db.prepare(`
      SELECT * FROM tasks
      WHERE status IN ('completed', 'canceled') AND completed_at >= ?
      ORDER BY completed_at DESC
    `).all(sinceStr) as any[];
    return rows.map(r => this.enrichTask(r));
  }

  getStats(): TaskStats {
    const today = new Date().toISOString().split('T')[0];

    const overdue = (this.db.prepare(`
      SELECT COUNT(*) as c FROM tasks WHERE due_date < ? AND status = 'open'
    `).get(today) as any).c;

    const todayCount = (this.db.prepare(`
      SELECT COUNT(*) as c FROM tasks
      WHERE status = 'open' AND (when_date <= ? OR (due_date < ? AND due_date IS NOT NULL))
    `).get(today, today) as any).c;

    const inbox = (this.db.prepare(`
      SELECT COUNT(*) as c FROM tasks
      WHERE project_id IS NULL AND when_date IS NULL AND status = 'open'
    `).get() as any).c;

    const total_open = (this.db.prepare(`
      SELECT COUNT(*) as c FROM tasks WHERE status = 'open'
    `).get() as any).c;

    return { overdue, today: todayCount, inbox, total_open };
  }

  getOverdueCount(): number {
    const today = new Date().toISOString().split('T')[0];
    return (this.db.prepare(`
      SELECT COUNT(*) as c FROM tasks WHERE due_date < ? AND status = 'open'
    `).get(today) as any).c;
  }

  // ── Project Queries ───────────────────────────────────────

  getProjects(): Project[] {
    const rows = this.db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'open') as open_task_count
      FROM projects p
      WHERE p.status = 'open'
      ORDER BY p.sort_order, p.title
    `).all() as any[];
    return rows;
  }

  getProject(id: string): (Project & { tasks: Task[] }) | null {
    const project = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) return null;

    const tasks = this.db.prepare(`
      SELECT * FROM tasks WHERE project_id = ? ORDER BY heading, sort_order, created_at
    `).all(id) as any[];

    return {
      ...project,
      tasks: tasks.map(t => this.enrichTask(t)),
    };
  }

  createProject(data: { title: string; notes?: string; area_id?: string; tags?: string[] }): Project {
    const id = this.genId();
    const now = this.now();
    this.db.prepare(`
      INSERT INTO projects (id, title, notes, area_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.title, data.notes || '', data.area_id || null, now, now);
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project;
  }

  updateProject(id: string, updates: Partial<{ title: string; notes: string; area_id: string | null; status: string; sort_order: number }>): Project | null {
    const fields: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (['title', 'notes', 'area_id', 'status', 'sort_order'].includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(this.now());
      values.push(id);
      this.db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | null;
  }

  completeProject(id: string): Project | null {
    this.db.prepare(`UPDATE projects SET status = 'completed', updated_at = ? WHERE id = ?`).run(this.now(), id);
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | null;
  }

  // ── Area Queries ──────────────────────────────────────────

  getAreas(): Area[] {
    const areas = this.db.prepare('SELECT * FROM areas ORDER BY sort_order, title').all() as Area[];
    for (const area of areas) {
      area.projects = this.db.prepare(`
        SELECT p.*,
          (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'open') as open_task_count
        FROM projects p WHERE p.area_id = ? AND p.status = 'open'
        ORDER BY p.sort_order, p.title
      `).all(area.id) as Project[];
    }
    return areas;
  }

  // ── Tag Queries ───────────────────────────────────────────

  getTags(): Tag[] {
    return this.db.prepare(`
      SELECT t.id, t.name, COUNT(tt.task_id) as count
      FROM tags t
      LEFT JOIN task_tags tt ON tt.tag_id = t.id
      GROUP BY t.id
      ORDER BY count DESC, t.name
    `).all() as Tag[];
  }

  getTaggedTasks(tagName: string): Task[] {
    const rows = this.db.prepare(`
      SELECT tk.* FROM tasks tk
      JOIN task_tags tt ON tt.task_id = tk.id
      JOIN tags t ON t.id = tt.tag_id
      WHERE t.name = ?
      ORDER BY tk.status, tk.sort_order, tk.created_at
    `).all(tagName) as any[];
    return rows.map(r => this.enrichTask(r));
  }

  // ── Cleanup ───────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
