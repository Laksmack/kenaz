import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { config } from './config';

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

interface NoteRow {
  id: string;
  path: string;
  title: string;
  type: string | null;
  subtype: string | null;
  company: string | null;
  date: string | null;
  created: string | null;
  modified: string | null;
  content_hash: string | null;
  processed: number;
  word_count: number;
}

const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})\s*[-–—]\s*/;

function pathToId(relativePath: string): string {
  return crypto.createHash('sha1').update(relativePath).digest('hex');
}

function extractDateFromFilename(filename: string): string | null {
  const match = filename.match(DATE_PREFIX_RE);
  return match ? match[1] : null;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function fileHash(content: string): string {
  return crypto.createHash('sha1').update(content).digest('hex');
}

export class VaultStore {
  private db: Database.Database;

  constructor() {
    const dir = path.dirname(config.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(config.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id            TEXT PRIMARY KEY,
        path          TEXT UNIQUE NOT NULL,
        title         TEXT,
        type          TEXT,
        subtype       TEXT,
        company       TEXT,
        date          TEXT,
        created       TEXT,
        modified      TEXT,
        content_hash  TEXT,
        processed     INTEGER DEFAULT 0,
        word_count    INTEGER
      );

      CREATE TABLE IF NOT EXISTS note_meta (
        note_id TEXT,
        key     TEXT,
        value   TEXT,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS note_tags (
        note_id TEXT,
        tag     TEXT,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
      CREATE INDEX IF NOT EXISTS idx_notes_company ON notes(company);
      CREATE INDEX IF NOT EXISTS idx_notes_date ON notes(date);
      CREATE INDEX IF NOT EXISTS idx_notes_processed ON notes(processed);
      CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag);
      CREATE INDEX IF NOT EXISTS idx_note_meta_note ON note_meta(note_id);
    `);

    this.ensureFts();
  }

  private ensureFts(): void {
    const hasFts = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notes_fts'"
    ).get();
    if (hasFts) return;

    this.db.exec(`
      CREATE VIRTUAL TABLE notes_fts USING fts5(
        title, content,
        content='notes', content_rowid='rowid'
      );
    `);
  }

  // ── Index Operations ─────────────────────────────────────────

  indexNote(filePath: string): void {
    const relativePath = path.relative(config.vaultPath, filePath);
    if (!relativePath.endsWith('.md')) return;

    let raw: string;
    let stat: fs.Stats;
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
      stat = fs.statSync(filePath);
    } catch {
      return;
    }

    const hash = fileHash(raw);
    const existing = this.db.prepare('SELECT content_hash FROM notes WHERE path = ?').get(relativePath) as { content_hash: string } | undefined;
    if (existing && existing.content_hash === hash) return;

    let fm: Record<string, any>;
    let content: string;
    try {
      const parsed = matter(raw);
      fm = parsed.data;
      content = parsed.content;
    } catch (e) {
      console.warn(`[Laguz] Failed to parse frontmatter: ${relativePath}`, e);
      fm = {};
      content = raw;
    }

    const filename = path.basename(relativePath, '.md');
    const id = pathToId(relativePath);

    const title = fm.title || filename.replace(DATE_PREFIX_RE, '');
    const type = fm.type || null;
    const subtype = fm.subtype || fm.meeting_type || null;
    const company = fm.company || null;

    let date: string | null = null;
    try {
      date = fm.date
        ? new Date(fm.date).toISOString().split('T')[0]
        : extractDateFromFilename(filename);
    } catch {
      date = extractDateFromFilename(filename);
    }

    let created: string;
    try {
      created = fm.created
        ? new Date(fm.created).toISOString()
        : stat.birthtime.toISOString();
    } catch {
      created = stat.birthtime.toISOString();
    }

    const modified = stat.mtime.toISOString();
    const processed = fm.processed === true || fm.processed === 1 ? 1 : 0;
    const wordCount = countWords(content);

    const upsert = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO notes (id, path, title, type, subtype, company, date, created, modified, content_hash, processed, word_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          path=excluded.path, title=excluded.title, type=excluded.type, subtype=excluded.subtype,
          company=excluded.company, date=excluded.date, created=excluded.created, modified=excluded.modified,
          content_hash=excluded.content_hash, processed=excluded.processed, word_count=excluded.word_count
      `).run(id, relativePath, title, type, subtype, company, date, created, modified, hash, processed, wordCount);

      this.db.prepare('DELETE FROM note_meta WHERE note_id = ?').run(id);
      const insertMeta = this.db.prepare('INSERT INTO note_meta (note_id, key, value) VALUES (?, ?, ?)');
      for (const [key, value] of Object.entries(fm)) {
        if (['title', 'type', 'subtype', 'company', 'date', 'created', 'processed', 'tags', 'meeting_type'].includes(key)) continue;
        insertMeta.run(id, key, String(value));
      }

      this.db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(id);
      const tags: string[] = Array.isArray(fm.tags) ? fm.tags : [];
      if (type) tags.push(type);
      const uniqueTags = [...new Set(tags)];
      const insertTag = this.db.prepare('INSERT INTO note_tags (note_id, tag) VALUES (?, ?)');
      for (const tag of uniqueTags) {
        insertTag.run(id, tag);
      }

      const rowid = (this.db.prepare('SELECT rowid FROM notes WHERE id = ?').get(id) as any)?.rowid;
      if (rowid != null) {
        this.db.prepare('INSERT OR REPLACE INTO notes_fts(rowid, title, content) VALUES (?, ?, ?)').run(rowid, title, content);
      }
    });

    upsert();
  }

  removeNote(filePath: string): void {
    const relativePath = path.relative(config.vaultPath, filePath);
    const id = pathToId(relativePath);

    this.db.transaction(() => {
      const rowid = (this.db.prepare('SELECT rowid FROM notes WHERE id = ?').get(id) as any)?.rowid;
      if (rowid != null) {
        this.db.prepare("INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', ?, '', '')").run(rowid);
      }
      this.db.prepare('DELETE FROM note_meta WHERE note_id = ?').run(id);
      this.db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(id);
      this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
    })();
  }

  rebuildIndex(): void {
    if (!fs.existsSync(config.vaultPath)) {
      console.warn(`[Laguz] Vault directory does not exist: ${config.vaultPath}`);
      return;
    }

    console.log('[Laguz] Rebuilding vault index...');
    const start = Date.now();
    let count = 0;
    let errors = 0;

    const walk = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.md')) {
          try {
            this.indexNote(full);
            count++;
          } catch (e) {
            errors++;
            console.warn(`[Laguz] Failed to index: ${entry.name}`, e);
          }
        }
      }
    };

    walk(config.vaultPath);
    console.log(`[Laguz] Indexed ${count} notes in ${Date.now() - start}ms` +
      (errors > 0 ? ` (${errors} errors)` : ''));
  }

  isEmpty(): boolean {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM notes').get() as { c: number };
    return row.c === 0;
  }

  // ── Query Operations ─────────────────────────────────────────

  private getTagsForNote(noteId: string): string[] {
    const rows = this.db.prepare('SELECT tag FROM note_tags WHERE note_id = ?').all(noteId) as { tag: string }[];
    return rows.map(r => r.tag);
  }

  private getMetaForNote(noteId: string): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM note_meta WHERE note_id = ?').all(noteId) as { key: string; value: string }[];
    const meta: Record<string, string> = {};
    for (const r of rows) meta[r.key] = r.value;
    return meta;
  }

  private enrichSummary(row: NoteRow): NoteSummary {
    return {
      ...row,
      tags: this.getTagsForNote(row.id),
    };
  }

  search(query: string, filters?: { type?: string; company?: string; since?: string; tags?: string[] }): NoteSummary[] {
    let rows: NoteRow[];

    if (query) {
      const ftsQuery = query.split(/\s+/).map(w => `"${w}"`).join(' ');
      let sql = `
        SELECT n.* FROM notes n
        JOIN notes_fts f ON f.rowid = n.rowid
        WHERE notes_fts MATCH ?
      `;
      const params: any[] = [ftsQuery];

      if (filters?.type) {
        sql += ' AND n.type = ?';
        params.push(filters.type);
      }
      if (filters?.company) {
        sql += ' AND n.company = ?';
        params.push(filters.company);
      }
      if (filters?.since) {
        sql += ' AND n.date >= ?';
        params.push(filters.since);
      }

      sql += ' ORDER BY rank LIMIT 100';
      rows = this.db.prepare(sql).all(...params) as NoteRow[];
    } else {
      let sql = 'SELECT * FROM notes WHERE 1=1';
      const params: any[] = [];

      if (filters?.type) {
        sql += ' AND type = ?';
        params.push(filters.type);
      }
      if (filters?.company) {
        sql += ' AND company = ?';
        params.push(filters.company);
      }
      if (filters?.since) {
        sql += ' AND date >= ?';
        params.push(filters.since);
      }

      sql += ' ORDER BY date DESC LIMIT 100';
      rows = this.db.prepare(sql).all(...params) as NoteRow[];
    }

    let results = rows.map(r => this.enrichSummary(r));

    if (filters?.tags && filters.tags.length > 0) {
      results = results.filter(r =>
        filters.tags!.some(t => r.tags.includes(t))
      );
    }

    return results;
  }

  getNote(notePath: string): NoteDetail | null {
    const row = this.db.prepare('SELECT * FROM notes WHERE path = ?').get(notePath) as NoteRow | undefined;
    if (!row) return null;

    const fullPath = path.join(config.vaultPath, notePath);
    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch { /* file may have been deleted */ }

    return {
      ...row,
      tags: this.getTagsForNote(row.id),
      meta: this.getMetaForNote(row.id),
      content,
    };
  }

  readFile(filePath: string): { path: string; content: string; modified: string } | null {
    const abs = filePath.startsWith('/') ? filePath : path.join(config.vaultPath, filePath);
    try {
      const stat = fs.statSync(abs);
      const content = fs.readFileSync(abs, 'utf-8');
      return { path: filePath, content, modified: stat.mtime.toISOString() };
    } catch { return null; }
  }

  getMeetings(company: string, since?: string): NoteSummary[] {
    let sql = "SELECT * FROM notes WHERE type = 'meeting' AND company = ?";
    const params: any[] = [company];

    if (since) {
      sql += ' AND date >= ?';
      params.push(since);
    }

    sql += ' ORDER BY date DESC';
    const rows = this.db.prepare(sql).all(...params) as NoteRow[];
    return rows.map(r => this.enrichSummary(r));
  }

  getAccount(folderPath: string): NoteSummary[] {
    const rows = this.db.prepare(
      'SELECT * FROM notes WHERE path LIKE ? ORDER BY modified DESC'
    ).all(`${folderPath}/%`) as NoteRow[];
    return rows.map(r => this.enrichSummary(r));
  }

  getFolderNotes(folderPath: string): NoteSummary[] {
    return this.getAccount(folderPath);
  }

  getSubfolders(parentPath: string): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT folder_name FROM (
        SELECT
          SUBSTR(path, LENGTH(?) + 2,
            INSTR(SUBSTR(path, LENGTH(?) + 2), '/') - 1
          ) as folder_name
        FROM notes
        WHERE path LIKE ?
      )
      WHERE folder_name IS NOT NULL AND folder_name != ''
      ORDER BY folder_name ASC
    `).all(parentPath, parentPath, `${parentPath}/%`) as { folder_name: string }[];
    return rows.map(r => r.folder_name).filter(n => !n.startsWith('.') && !n.startsWith('_'));
  }

  getUnprocessed(since?: string): NoteSummary[] {
    let sql = "SELECT * FROM notes WHERE type = 'meeting' AND processed = 0";
    const params: any[] = [];

    if (since) {
      sql += ' AND date >= ?';
      params.push(since);
    }

    sql += ' ORDER BY date DESC';
    const rows = this.db.prepare(sql).all(...params) as NoteRow[];
    return rows.map(r => this.enrichSummary(r));
  }

  getCompanies(): string[] {
    const rows = this.db.prepare(
      "SELECT DISTINCT company FROM notes WHERE company IS NOT NULL AND company != '' ORDER BY company ASC"
    ).all() as { company: string }[];
    return rows.map(r => r.company);
  }

  getRecent(limit: number = 50): NoteSummary[] {
    const rows = this.db.prepare(
      'SELECT * FROM notes ORDER BY modified DESC LIMIT ?'
    ).all(limit) as NoteRow[];
    return rows.map(r => this.enrichSummary(r));
  }

  // ── Write Operations ─────────────────────────────────────────

  writeNote(notePath: string, content: string): void {
    const fullPath = path.join(config.vaultPath, notePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, 'utf-8');
    this.indexNote(fullPath);
  }

  // ── Cleanup ──────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
