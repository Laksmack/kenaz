import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import crypto from 'crypto';
import type { Task, TaskAttachment, TaskGroup, Tag, TaskStats } from '../shared/types';
import { extractGroup } from '../shared/types';

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
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT DEFAULT '',
        status TEXT DEFAULT 'open' CHECK(status IN ('open', 'completed', 'canceled')),
        priority INTEGER DEFAULT 0 CHECK(priority BETWEEN 0 AND 3),
        due_date TEXT,
        completed_at TEXT,
        sort_order REAL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        kenaz_thread_id TEXT,
        hubspot_deal_id TEXT,
        vault_path TEXT,
        calendar_event_id TEXT
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
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

      CREATE TABLE IF NOT EXISTS task_attachments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT DEFAULT 'application/octet-stream',
        size INTEGER DEFAULT 0,
        source TEXT DEFAULT 'upload',
        source_ref TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);
    `);

    this.migrateDropProjects();
  }

  private migrateDropProjects(): void {
    const columns = this.db.pragma('table_info(tasks)') as { name: string }[];
    const hasProjectId = columns.some(c => c.name === 'project_id');
    if (!hasProjectId) return;

    console.log('[Raidō] Migrating: removing projects/areas, converting to bracket groups');

    // Check if projects table exists
    const projectsExist = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
    ).get();

    if (projectsExist) {
      // Prepend [ProjectName] to task titles where project_id is set
      // and the title doesn't already have a bracket prefix
      const tasksWithProjects = this.db.prepare(`
        SELECT t.id, t.title, p.title as project_title
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE t.project_id IS NOT NULL
      `).all() as { id: string; title: string; project_title: string }[];

      for (const task of tasksWithProjects) {
        if (!task.title.startsWith('[')) {
          const newTitle = `[${task.project_title}] ${task.title}`;
          this.db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(newTitle, task.id);
        }
      }
      console.log(`[Raidō] Converted ${tasksWithProjects.filter(t => !t.title.startsWith('[')).length} tasks to bracket groups`);
    }

    // Recreate tasks table without project_id and heading
    this.db.exec(`
      CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT DEFAULT '',
        status TEXT DEFAULT 'open' CHECK(status IN ('open', 'completed', 'canceled')),
        priority INTEGER DEFAULT 0 CHECK(priority BETWEEN 0 AND 3),
        due_date TEXT,
        completed_at TEXT,
        sort_order REAL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        kenaz_thread_id TEXT,
        hubspot_deal_id TEXT,
        vault_path TEXT,
        calendar_event_id TEXT
      );

      INSERT INTO tasks_new
        SELECT id, title, notes, status, priority, due_date,
               completed_at, sort_order, created_at, updated_at,
               kenaz_thread_id, hubspot_deal_id, vault_path, calendar_event_id
        FROM tasks;

      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;

      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
    `);

    // Drop projects and areas tables
    const tables = ['projects', 'areas'];
    for (const table of tables) {
      const exists = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table);
      if (exists) {
        this.db.exec(`DROP TABLE ${table}`);
        console.log(`[Raidō] Dropped table: ${table}`);
      }
    }

    console.log('[Raidō] Migration complete: projects removed, bracket groups active');
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
    this.db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId);

    for (const name of tagNames) {
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
        AND due_date IS NOT NULL
        AND due_date <= ?
      ORDER BY due_date ASC, priority DESC, sort_order ASC
    `).all(today) as any[];
    return rows.map(r => this.enrichTask(r));
  }

  getInbox(): Task[] {
    const rows = this.db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'open'
        AND due_date IS NULL
      ORDER BY created_at DESC
    `).all() as any[];
    return rows.map(r => this.enrichTask(r));
  }

  getUpcoming(): Task[] {
    const today = new Date().toISOString().split('T')[0];
    const rows = this.db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'open'
        AND due_date IS NOT NULL
        AND due_date > ?
      ORDER BY due_date ASC, priority DESC
    `).all(today) as any[];
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
    priority?: number;
    tags?: string[];
    kenaz_thread_id?: string;
    hubspot_deal_id?: string;
    vault_path?: string;
    calendar_event_id?: string;
  }): Task {
    const id = this.genId();
    const now = this.now();
    this.db.prepare(`
      INSERT INTO tasks (id, title, notes, due_date, priority,
                         kenaz_thread_id, hubspot_deal_id, vault_path, calendar_event_id,
                         created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.title,
      data.notes || '',
      data.due_date || null,
      data.priority || 0,
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
    priority: number;
    status: string;
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
      'title', 'notes', 'due_date',
      'priority', 'status', 'sort_order',
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
      SELECT COUNT(*) as c FROM tasks
      WHERE due_date < ? AND due_date IS NOT NULL AND status = 'open'
    `).get(today) as any).c;

    const todayCount = (this.db.prepare(`
      SELECT COUNT(*) as c FROM tasks
      WHERE status = 'open' AND due_date IS NOT NULL AND due_date <= ?
    `).get(today) as any).c;

    const inbox = (this.db.prepare(`
      SELECT COUNT(*) as c FROM tasks
      WHERE due_date IS NULL AND status = 'open'
    `).get() as any).c;

    const total_open = (this.db.prepare(`
      SELECT COUNT(*) as c FROM tasks WHERE status = 'open'
    `).get() as any).c;

    return { overdue, today: todayCount, inbox, total_open };
  }

  getOverdueCount(): number {
    const today = new Date().toISOString().split('T')[0];
    return (this.db.prepare(`
      SELECT COUNT(*) as c FROM tasks
      WHERE due_date <= ? AND due_date IS NOT NULL AND status = 'open'
    `).get(today) as any).c;
  }

  // ── Group Queries (bracket prefix) ─────────────────────────

  getGroups(): TaskGroup[] {
    const rows = this.db.prepare(`
      SELECT title FROM tasks WHERE status = 'open'
    `).all() as { title: string }[];

    const counts = new Map<string, number>();
    for (const row of rows) {
      const group = extractGroup(row.title);
      if (group) {
        counts.set(group, (counts.get(group) || 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getGroup(name: string): Task[] {
    const prefix = `[${name}]`;
    const rows = this.db.prepare(`
      SELECT * FROM tasks
      WHERE title LIKE ? AND status = 'open'
      ORDER BY due_date ASC, priority DESC, sort_order ASC
    `).all(`${prefix}%`) as any[];
    return rows.map(r => this.enrichTask(r));
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

  // ── Attachments ─────────────────────────────────────────────

  private getAttachmentsDir(taskId: string): string {
    const dir = path.join(app.getPath('userData'), 'attachments', taskId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  getAttachments(taskId: string): TaskAttachment[] {
    return this.db.prepare(
      'SELECT * FROM task_attachments WHERE task_id = ? ORDER BY created_at ASC'
    ).all(taskId) as TaskAttachment[];
  }

  addAttachment(taskId: string, filename: string, buffer: Buffer, opts?: {
    mimeType?: string;
    source?: 'email' | 'upload' | 'vault';
    sourceRef?: string;
  }): TaskAttachment {
    const id = this.genId();
    const dir = this.getAttachmentsDir(taskId);
    const filePath = path.join(dir, `${id}_${filename}`);
    fs.writeFileSync(filePath, buffer);

    this.db.prepare(`
      INSERT INTO task_attachments (id, task_id, filename, mime_type, size, source, source_ref, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, taskId, filename,
      opts?.mimeType || 'application/octet-stream',
      buffer.length,
      opts?.source || 'upload',
      opts?.sourceRef || null,
      this.now(),
    );

    return this.db.prepare('SELECT * FROM task_attachments WHERE id = ?').get(id) as TaskAttachment;
  }

  getAttachmentPath(taskId: string, attachmentId: string): string | null {
    const att = this.db.prepare(
      'SELECT * FROM task_attachments WHERE id = ? AND task_id = ?'
    ).get(attachmentId, taskId) as TaskAttachment | undefined;
    if (!att) return null;

    const dir = path.join(app.getPath('userData'), 'attachments', taskId);
    const filePath = path.join(dir, `${attachmentId}_${att.filename}`);
    return fs.existsSync(filePath) ? filePath : null;
  }

  deleteAttachment(taskId: string, attachmentId: string): boolean {
    const filePath = this.getAttachmentPath(taskId, attachmentId);
    if (filePath) {
      try { fs.unlinkSync(filePath); } catch {}
    }
    const result = this.db.prepare(
      'DELETE FROM task_attachments WHERE id = ? AND task_id = ?'
    ).run(attachmentId, taskId);
    return result.changes > 0;
  }

  // ── Cleanup ───────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
