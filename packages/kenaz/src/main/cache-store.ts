import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import type { EmailThread, Email, EmailAddress, CacheStats, SendEmailPayload, OutboxItem, NudgeType } from '../shared/types';

function getDbPath(): string {
  return path.join(app.getPath('userData'), 'kenaz-cache.db');
}

export class CacheStore {
  private db: Database.Database;

  constructor() {
    const dbPath = getDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        subject TEXT,
        snippet TEXT,
        last_date TEXT,
        labels TEXT,
        is_unread INTEGER,
        from_name TEXT,
        from_email TEXT,
        participants TEXT,
        has_attachments INTEGER,
        history_id TEXT,
        cached_at TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT,
        from_name TEXT,
        from_email TEXT,
        to_addrs TEXT,
        cc_addrs TEXT,
        bcc_addrs TEXT,
        subject TEXT,
        snippet TEXT,
        body TEXT,
        body_text TEXT,
        date TEXT,
        labels TEXT,
        is_unread INTEGER,
        has_attachments INTEGER,
        attachments TEXT,
        cached_at TEXT,
        FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
      CREATE INDEX IF NOT EXISTS idx_threads_last_date ON threads(last_date);
      CREATE INDEX IF NOT EXISTS idx_threads_labels ON threads(labels);

      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS pending_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        payload TEXT,
        created_at TEXT NOT NULL,
        status TEXT DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        status TEXT DEFAULT 'queued',
        error TEXT,
        sent_at TEXT
      );
    `);

    // Contacts table for recipient autocomplete
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        email TEXT PRIMARY KEY,
        name TEXT,
        frequency INTEGER DEFAULT 1,
        last_used TEXT,
        source TEXT DEFAULT 'email'
      );
      CREATE INDEX IF NOT EXISTS idx_contacts_freq ON contacts(frequency DESC);
    `);

    // Snoozed threads table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snoozed_threads (
        thread_id TEXT PRIMARY KEY,
        snooze_until TEXT NOT NULL,
        snoozed_at TEXT NOT NULL,
        original_labels TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_snoozed_until ON snoozed_threads(snooze_until);
    `);

    // Migrate: add nudge_type column to threads if it doesn't exist
    try {
      this.db.exec(`ALTER TABLE threads ADD COLUMN nudge_type TEXT`);
    } catch {
      // Column already exists — that's fine
    }

    // Create FTS5 table if not exists (separate try since virtual tables can't use IF NOT EXISTS easily)
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
          subject, body_text, from_name, from_email, to_addrs,
          content=messages, content_rowid=rowid
        );
      `);
    } catch {
      // Already exists — that's fine
    }

    // Create triggers to keep FTS in sync
    try {
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(rowid, subject, body_text, from_name, from_email, to_addrs)
          VALUES (new.rowid, new.subject, new.body_text, new.from_name, new.from_email, new.to_addrs);
        END;

        CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, subject, body_text, from_name, from_email, to_addrs)
          VALUES ('delete', old.rowid, old.subject, old.body_text, old.from_name, old.from_email, old.to_addrs);
        END;

        CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, subject, body_text, from_name, from_email, to_addrs)
          VALUES ('delete', old.rowid, old.subject, old.body_text, old.from_name, old.from_email, old.to_addrs);
          INSERT INTO messages_fts(rowid, subject, body_text, from_name, from_email, to_addrs)
          VALUES (new.rowid, new.subject, new.body_text, new.from_name, new.from_email, new.to_addrs);
        END;
      `);
    } catch {
      // Triggers already exist
    }
  }

  // ── Thread operations ────────────────────────────────────

  upsertThreads(threads: EmailThread[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO threads (id, subject, snippet, last_date, labels, is_unread, from_name, from_email, participants, has_attachments, history_id, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((items: EmailThread[]) => {
      for (const t of items) {
        const hasAttachments = t.messages.some(m => m.hasAttachments) ? 1 : 0;
        stmt.run(
          t.id,
          t.subject,
          t.snippet,
          t.lastDate,
          JSON.stringify(t.labels),
          t.isUnread ? 1 : 0,
          t.from.name,
          t.from.email,
          JSON.stringify(t.participants),
          hasAttachments,
          null, // history_id filled by sync engine
          new Date().toISOString(),
        );
      }
    });

    transaction(threads);
  }

  upsertMessages(messages: Email[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (id, thread_id, from_name, from_email, to_addrs, cc_addrs, bcc_addrs, subject, snippet, body, body_text, date, labels, is_unread, has_attachments, attachments, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((items: Email[]) => {
      for (const m of items) {
        stmt.run(
          m.id,
          m.threadId,
          m.from.name,
          m.from.email,
          JSON.stringify(m.to),
          JSON.stringify(m.cc),
          JSON.stringify(m.bcc),
          m.subject,
          m.snippet,
          m.body,
          m.bodyText,
          m.date,
          JSON.stringify(m.labels),
          m.isUnread ? 1 : 0,
          m.hasAttachments ? 1 : 0,
          JSON.stringify(m.attachments),
          new Date().toISOString(),
        );
      }
    });

    transaction(messages);
  }

  /**
   * Store a full thread (thread metadata + all messages) in the cache.
   */
  upsertFullThread(thread: EmailThread): void {
    this.upsertThreads([thread]);
    if (thread.messages.length > 0 && thread.messages[0].body) {
      this.upsertMessages(thread.messages);
    }
  }

  /**
   * Get cached threads matching a set of labels, ordered by date.
   * If labels is empty, returns all cached threads.
   */
  getThreadsByLabels(labels: string[], limit: number = 50, offset: number = 0): EmailThread[] {
    let rows: any[];
    if (labels.length === 0) {
      rows = this.db.prepare(
        `SELECT * FROM threads ORDER BY last_date DESC LIMIT ? OFFSET ?`
      ).all(limit, offset);
    } else {
      // Match threads that contain ALL specified labels
      const conditions = labels.map(() => `labels LIKE ?`).join(' AND ');
      const params = labels.map(l => `%"${l}"%`);
      rows = this.db.prepare(
        `SELECT * FROM threads WHERE ${conditions} ORDER BY last_date DESC LIMIT ? OFFSET ?`
      ).all(...params, limit, offset);
    }

    return rows.map(row => this.rowToThread(row));
  }

  /**
   * Get threads for a Gmail-style query by parsing common patterns.
   * Supports: in:inbox, label:X, is:starred, is:unread, in:sent, in:drafts
   */
  getThreadsByQuery(query: string, limit: number = 50): EmailThread[] {
    if (!query || query.trim() === '') {
      return this.getThreadsByLabels([], limit);
    }

    const q = query.trim().toLowerCase();

    if (q === 'in:inbox') {
      return this.getThreadsByLabels(['INBOX'], limit);
    }
    if (q === 'is:starred') {
      return this.getThreadsByLabels(['STARRED'], limit);
    }
    if (q === 'in:sent') {
      return this.getThreadsByLabels(['SENT'], limit);
    }
    if (q === 'in:drafts') {
      return this.getThreadsByLabels(['DRAFT'], limit);
    }

    const labelMatch = q.match(/^label:(\S+)$/);
    if (labelMatch) {
      return this.getThreadsByLabels([labelMatch[1].toUpperCase()], limit);
    }

    // Fallback: return all threads (the sync engine will have the right data)
    return this.getThreadsByLabels([], limit);
  }

  /**
   * Get a single thread with all its cached messages.
   */
  getThread(threadId: string): EmailThread | null {
    const row = this.db.prepare('SELECT * FROM threads WHERE id = ?').get(threadId) as any;
    if (!row) return null;

    const thread = this.rowToThread(row);

    // Load full messages if cached
    const msgRows = this.db.prepare(
      'SELECT * FROM messages WHERE thread_id = ? ORDER BY date ASC'
    ).all(threadId) as any[];

    if (msgRows.length > 0) {
      thread.messages = msgRows.map(r => this.rowToMessage(r));
    }

    return thread;
  }

  /**
   * Check if a thread has full message bodies cached.
   */
  hasFullThread(threadId: string): boolean {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM messages WHERE thread_id = ? AND body IS NOT NULL AND body != \'\''
    ).get(threadId) as any;
    return row.cnt > 0;
  }

  /**
   * Update labels for a thread in the cache (for offline mutations).
   */
  updateThreadLabels(threadId: string, addLabels: string[], removeLabels: string[]): void {
    const row = this.db.prepare('SELECT labels FROM threads WHERE id = ?').get(threadId) as any;
    if (!row) return;

    let labels: string[] = JSON.parse(row.labels || '[]');
    for (const r of removeLabels) {
      labels = labels.filter(l => l !== r);
    }
    for (const a of addLabels) {
      if (!labels.includes(a)) labels.push(a);
    }

    this.db.prepare('UPDATE threads SET labels = ?, is_unread = ? WHERE id = ?')
      .run(JSON.stringify(labels), labels.includes('UNREAD') ? 1 : 0, threadId);

    // Also update message labels
    const msgRows = this.db.prepare('SELECT id, labels FROM messages WHERE thread_id = ?').all(threadId) as any[];
    const updateMsg = this.db.prepare('UPDATE messages SET labels = ?, is_unread = ? WHERE id = ?');
    for (const msg of msgRows) {
      let mLabels: string[] = JSON.parse(msg.labels || '[]');
      for (const r of removeLabels) {
        mLabels = mLabels.filter(l => l !== r);
      }
      for (const a of addLabels) {
        if (!mLabels.includes(a)) mLabels.push(a);
      }
      updateMsg.run(JSON.stringify(mLabels), mLabels.includes('UNREAD') ? 1 : 0, msg.id);
    }
  }

  /**
   * Remove a thread from the cache entirely.
   */
  deleteThread(threadId: string): void {
    this.db.prepare('DELETE FROM messages WHERE thread_id = ?').run(threadId);
    this.db.prepare('DELETE FROM threads WHERE id = ?').run(threadId);
  }

  // ── Search ──────────────────────────────────────────────

  searchLocal(query: string, limit: number = 50): EmailThread[] {
    if (!query.trim()) return [];

    try {
      // Escape special FTS5 characters and build a prefix query
      const sanitized = query.replace(/['"]/g, '').trim();
      const terms = sanitized.split(/\s+/).filter(Boolean);
      const ftsQuery = terms.map(t => `"${t}"*`).join(' AND ');

      const rows = this.db.prepare(`
        SELECT DISTINCT m.thread_id
        FROM messages_fts fts
        JOIN messages m ON m.rowid = fts.rowid
        WHERE messages_fts MATCH ?
        ORDER BY m.date DESC
        LIMIT ?
      `).all(ftsQuery, limit) as any[];

      const threadIds = rows.map(r => r.thread_id);
      if (threadIds.length === 0) return [];

      const placeholders = threadIds.map(() => '?').join(',');
      const threadRows = this.db.prepare(
        `SELECT * FROM threads WHERE id IN (${placeholders}) ORDER BY last_date DESC`
      ).all(...threadIds) as any[];

      return threadRows.map(row => this.rowToThread(row));
    } catch (e) {
      console.error('[CacheStore] FTS search failed:', e);
      // Fallback: simple LIKE search on threads table
      const likeQuery = `%${query}%`;
      const rows = this.db.prepare(
        `SELECT * FROM threads WHERE subject LIKE ? OR snippet LIKE ? OR from_name LIKE ? OR from_email LIKE ? ORDER BY last_date DESC LIMIT ?`
      ).all(likeQuery, likeQuery, likeQuery, likeQuery, limit) as any[];
      return rows.map(row => this.rowToThread(row));
    }
  }

  // ── Nudge tracking ─────────────────────────────────────

  /**
   * Mark a thread as nudged by Gmail.
   * Called by the sync engine when it detects INBOX was re-added without new messages.
   */
  setNudge(threadId: string, nudgeType: NudgeType): void {
    this.db.prepare('UPDATE threads SET nudge_type = ? WHERE id = ?').run(nudgeType, threadId);
  }

  /**
   * Clear the nudge flag on a thread (e.g. when new messages arrive or thread is archived).
   */
  clearNudge(threadId: string): void {
    this.db.prepare('UPDATE threads SET nudge_type = NULL WHERE id = ?').run(threadId);
  }

  /**
   * Clear nudges for multiple threads at once.
   */
  clearNudges(threadIds: string[]): void {
    if (threadIds.length === 0) return;
    const stmt = this.db.prepare('UPDATE threads SET nudge_type = NULL WHERE id = ?');
    const transaction = this.db.transaction((ids: string[]) => {
      for (const id of ids) stmt.run(id);
    });
    transaction(threadIds);
  }

  // ── Contacts (autocomplete) ────────────────────────────

  /**
   * Record email addresses seen in messages (from, to, cc, bcc).
   * Increments frequency for existing contacts, inserts new ones.
   * @param frequencyBoost — extra frequency weight (e.g. 3 for sent-to addresses)
   */
  recordContacts(addresses: EmailAddress[], frequencyBoost: number = 1): void {
    if (addresses.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT INTO contacts (email, name, frequency, last_used, source)
      VALUES (?, ?, ?, ?, 'email')
      ON CONFLICT(email) DO UPDATE SET
        frequency = frequency + ?,
        name = CASE
          WHEN excluded.name != '' AND excluded.name != excluded.email THEN excluded.name
          ELSE contacts.name
        END,
        last_used = excluded.last_used
    `);

    const now = new Date().toISOString();
    const transaction = this.db.transaction((addrs: EmailAddress[]) => {
      const seen = new Set<string>();
      for (const addr of addrs) {
        const email = addr.email.toLowerCase().trim();
        if (!email || !email.includes('@') || seen.has(email)) continue;
        seen.add(email);
        const name = (addr.name || '').trim();
        stmt.run(email, name, frequencyBoost, now, frequencyBoost);
      }
    });

    transaction(addresses);
  }

  /**
   * Search contacts for autocomplete suggestions.
   * Prefix matches rank higher than substring matches; ordered by frequency.
   */
  suggestContacts(prefix: string, limit: number = 8): Array<{ email: string; name: string; frequency: number }> {
    if (!prefix || prefix.trim().length === 0) return [];

    const sanitized = prefix.trim().toLowerCase();
    const prefixPattern = `${sanitized}%`;
    const containsPattern = `%${sanitized}%`;

    const rows = this.db.prepare(`
      SELECT email, name, frequency FROM contacts
      WHERE email LIKE ? OR name LIKE ?
      ORDER BY
        CASE WHEN email LIKE ? OR name LIKE ? THEN 0 ELSE 1 END,
        frequency DESC
      LIMIT ?
    `).all(containsPattern, containsPattern, prefixPattern, prefixPattern, limit) as any[];

    return rows.map(r => ({
      email: r.email,
      name: r.name || '',
      frequency: r.frequency,
    }));
  }

  // ── Snooze ─────────────────────────────────────────────

  /**
   * Snooze a thread — record it in the snoozed_threads table.
   */
  snoozeThread(threadId: string, snoozeUntil: string, originalLabels: string[]): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO snoozed_threads (thread_id, snooze_until, snoozed_at, original_labels)
      VALUES (?, ?, ?, ?)
    `).run(threadId, snoozeUntil, new Date().toISOString(), JSON.stringify(originalLabels));
  }

  /**
   * Get all snoozes that have expired (snooze_until <= now).
   */
  getExpiredSnoozes(): Array<{ threadId: string; snoozeUntil: string; snoozedAt: string; originalLabels: string[] }> {
    const now = new Date().toISOString();
    const rows = this.db.prepare(
      `SELECT * FROM snoozed_threads WHERE snooze_until <= ? ORDER BY snooze_until ASC`
    ).all(now) as any[];
    return rows.map(r => ({
      threadId: r.thread_id,
      snoozeUntil: r.snooze_until,
      snoozedAt: r.snoozed_at,
      originalLabels: JSON.parse(r.original_labels || '[]'),
    }));
  }

  /**
   * Get snooze info for a specific thread (or null if not snoozed).
   */
  getSnoozedThread(threadId: string): { threadId: string; snoozeUntil: string; snoozedAt: string; originalLabels: string[] } | null {
    const row = this.db.prepare(
      `SELECT * FROM snoozed_threads WHERE thread_id = ?`
    ).get(threadId) as any;
    if (!row) return null;
    return {
      threadId: row.thread_id,
      snoozeUntil: row.snooze_until,
      snoozedAt: row.snoozed_at,
      originalLabels: JSON.parse(row.original_labels || '[]'),
    };
  }

  /**
   * Cancel a snooze (remove from snoozed_threads).
   */
  cancelSnooze(threadId: string): void {
    this.db.prepare('DELETE FROM snoozed_threads WHERE thread_id = ?').run(threadId);
  }

  /**
   * Get all currently snoozed threads with their wake-up times.
   */
  getAllSnoozed(): Array<{ threadId: string; snoozeUntil: string; snoozedAt: string; originalLabels: string[] }> {
    const rows = this.db.prepare(
      `SELECT * FROM snoozed_threads ORDER BY snooze_until ASC`
    ).all() as any[];
    return rows.map(r => ({
      threadId: r.thread_id,
      snoozeUntil: r.snooze_until,
      snoozedAt: r.snoozed_at,
      originalLabels: JSON.parse(r.original_labels || '[]'),
    }));
  }

  /**
   * Check if a thread is currently snoozed.
   */
  isSnoozed(threadId: string): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM snoozed_threads WHERE thread_id = ?'
    ).get(threadId);
    return !!row;
  }

  // ── Sync metadata ───────────────────────────────────────

  getLastHistoryId(): string | null {
    const row = this.db.prepare("SELECT value FROM sync_meta WHERE key = 'lastHistoryId'").get() as any;
    return row?.value || null;
  }

  setLastHistoryId(id: string): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('lastHistoryId', ?)"
    ).run(id);
  }

  getLastSyncedAt(): string | null {
    const row = this.db.prepare("SELECT value FROM sync_meta WHERE key = 'lastSyncedAt'").get() as any;
    return row?.value || null;
  }

  setLastSyncedAt(ts: string): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('lastSyncedAt', ?)"
    ).run(ts);
  }

  // ── Pending actions (offline queue) ────────────────────

  enqueuePendingAction(type: string, threadId: string, payload: any): number {
    const result = this.db.prepare(
      `INSERT INTO pending_actions (type, thread_id, payload, created_at) VALUES (?, ?, ?, ?)`
    ).run(type, threadId, JSON.stringify(payload), new Date().toISOString());
    return Number(result.lastInsertRowid);
  }

  getPendingActions(): Array<{ id: number; type: string; threadId: string; payload: any; createdAt: string }> {
    const rows = this.db.prepare(
      "SELECT * FROM pending_actions WHERE status = 'pending' ORDER BY id ASC"
    ).all() as any[];
    return rows.map(r => ({
      id: r.id,
      type: r.type,
      threadId: r.thread_id,
      payload: JSON.parse(r.payload || '{}'),
      createdAt: r.created_at,
    }));
  }

  markActionSynced(id: number): void {
    this.db.prepare("UPDATE pending_actions SET status = 'synced' WHERE id = ?").run(id);
  }

  markActionFailed(id: number): void {
    this.db.prepare("UPDATE pending_actions SET status = 'failed' WHERE id = ?").run(id);
  }

  removePendingAction(id: number): void {
    this.db.prepare('DELETE FROM pending_actions WHERE id = ?').run(id);
  }

  getPendingActionCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM pending_actions WHERE status = 'pending'").get() as any;
    return row.cnt;
  }

  // ── Outbox ─────────────────────────────────────────────

  enqueueOutbox(payload: SendEmailPayload): number {
    const result = this.db.prepare(
      `INSERT INTO outbox (payload, created_at) VALUES (?, ?)`
    ).run(JSON.stringify(payload), new Date().toISOString());
    return Number(result.lastInsertRowid);
  }

  getOutboxItems(): OutboxItem[] {
    const rows = this.db.prepare(
      "SELECT * FROM outbox WHERE status IN ('queued', 'failed') ORDER BY id ASC"
    ).all() as any[];
    return rows.map(r => ({
      id: r.id,
      payload: JSON.parse(r.payload),
      createdAt: r.created_at,
      status: r.status,
      error: r.error,
      sentAt: r.sent_at,
    }));
  }

  markOutboxSending(id: number): void {
    this.db.prepare("UPDATE outbox SET status = 'sending' WHERE id = ?").run(id);
  }

  markOutboxSent(id: number): void {
    this.db.prepare("UPDATE outbox SET status = 'sent', sent_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  markOutboxFailed(id: number, error: string): void {
    this.db.prepare("UPDATE outbox SET status = 'failed', error = ? WHERE id = ?")
      .run(error, id);
  }

  cancelOutboxItem(id: number): void {
    this.db.prepare('DELETE FROM outbox WHERE id = ?').run(id);
  }

  getOutboxCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM outbox WHERE status IN ('queued', 'failed')").get() as any;
    return row.cnt;
  }

  // ── Stats & maintenance ────────────────────────────────

  getStats(): CacheStats {
    const threads = (this.db.prepare('SELECT COUNT(*) as cnt FROM threads').get() as any).cnt;
    const messages = (this.db.prepare('SELECT COUNT(*) as cnt FROM messages').get() as any).cnt;
    const pending = this.getPendingActionCount();
    const outbox = this.getOutboxCount();

    let sizeBytes = 0;
    try {
      const dbPath = getDbPath();
      if (fs.existsSync(dbPath)) {
        sizeBytes = fs.statSync(dbPath).size;
        // Also count WAL file
        const walPath = dbPath + '-wal';
        if (fs.existsSync(walPath)) {
          sizeBytes += fs.statSync(walPath).size;
        }
      }
    } catch {}

    return {
      sizeBytes,
      threadCount: threads,
      messageCount: messages,
      lastSyncedAt: this.getLastSyncedAt(),
      pendingActions: pending,
      outboxCount: outbox,
    };
  }

  /**
   * Prune old cached data to stay under the max size limit.
   * Evicts oldest threads first, never evicts threads with pending actions.
   */
  prune(maxSizeBytes: number): void {
    const stats = this.getStats();
    if (stats.sizeBytes <= maxSizeBytes) return;

    const pendingThreadIds = this.db.prepare(
      "SELECT DISTINCT thread_id FROM pending_actions WHERE status = 'pending'"
    ).all() as any[];
    const protectedIds = new Set(pendingThreadIds.map(r => r.thread_id));

    // Get oldest threads
    const oldThreads = this.db.prepare(
      'SELECT id FROM threads ORDER BY cached_at ASC LIMIT 100'
    ).all() as any[];

    for (const row of oldThreads) {
      if (protectedIds.has(row.id)) continue;
      this.deleteThread(row.id);

      // Check size after each deletion
      const currentSize = this.getStats().sizeBytes;
      if (currentSize <= maxSizeBytes * 0.9) break; // Stop when at 90% of limit
    }
  }

  /**
   * Clear all cached email data (keeps pending actions and outbox).
   */
  clearCache(): void {
    this.db.exec('DELETE FROM messages');
    this.db.exec('DELETE FROM threads');
    this.db.exec("DELETE FROM sync_meta WHERE key IN ('lastHistoryId', 'lastSyncedAt')");
    // Rebuild FTS
    try {
      this.db.exec("INSERT INTO messages_fts(messages_fts) VALUES('rebuild')");
    } catch {}
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  // ── Private helpers ────────────────────────────────────

  private rowToThread(row: any): EmailThread {
    const participants: EmailAddress[] = JSON.parse(row.participants || '[]');
    const labels: string[] = JSON.parse(row.labels || '[]');

    return {
      id: row.id,
      subject: row.subject || '',
      snippet: row.snippet || '',
      messages: [], // Metadata-only; full messages loaded separately
      lastDate: row.last_date || '',
      labels,
      isUnread: row.is_unread === 1,
      from: { name: row.from_name || '', email: row.from_email || '' },
      participants,
      nudgeType: row.nudge_type || null,
    };
  }

  private rowToMessage(row: any): Email {
    return {
      id: row.id,
      threadId: row.thread_id,
      from: { name: row.from_name || '', email: row.from_email || '' },
      to: JSON.parse(row.to_addrs || '[]'),
      cc: JSON.parse(row.cc_addrs || '[]'),
      bcc: JSON.parse(row.bcc_addrs || '[]'),
      subject: row.subject || '',
      snippet: row.snippet || '',
      body: row.body || '',
      bodyText: row.body_text || '',
      date: row.date || '',
      labels: JSON.parse(row.labels || '[]'),
      isUnread: row.is_unread === 1,
      hasAttachments: row.has_attachments === 1,
      attachments: JSON.parse(row.attachments || '[]'),
    };
  }
}
