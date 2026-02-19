import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import crypto from 'crypto';
import type {
  CalendarEvent, Calendar, Attendee, SyncQueueItem,
  CreateEventInput, UpdateEventInput, ConferenceData, EventAttachment,
} from '../shared/types';

export class CacheStore {
  private db: Database.Database;

  constructor() {
    const dbPath = path.join(app.getPath('userData'), 'dagaz.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS calendars (
        id TEXT PRIMARY KEY,
        summary TEXT NOT NULL,
        description TEXT,
        color_id TEXT,
        color_override TEXT,
        background_color TEXT,
        foreground_color TEXT,
        access_role TEXT,
        primary_calendar INTEGER DEFAULT 0,
        visible INTEGER DEFAULT 1,
        time_zone TEXT,
        sync_token TEXT,
        last_synced_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        google_id TEXT UNIQUE,
        calendar_id TEXT NOT NULL REFERENCES calendars(id),
        summary TEXT,
        description TEXT,
        location TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        start_date TEXT,
        end_date TEXT,
        all_day INTEGER DEFAULT 0,
        time_zone TEXT,
        status TEXT DEFAULT 'confirmed',
        self_response TEXT,
        organizer_email TEXT,
        organizer_name TEXT,
        is_organizer INTEGER DEFAULT 0,
        recurrence_rule TEXT,
        recurring_event_id TEXT,
        html_link TEXT,
        hangout_link TEXT,
        conference_data TEXT,
        transparency TEXT DEFAULT 'opaque',
        visibility TEXT DEFAULT 'default',
        color_id TEXT,
        reminders TEXT,
        etag TEXT,
        local_only INTEGER DEFAULT 0,
        pending_action TEXT,
        pending_payload TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_events_calendar ON events(calendar_id);
      CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time);
      CREATE INDEX IF NOT EXISTS idx_events_end ON events(end_time);
      CREATE INDEX IF NOT EXISTS idx_events_google ON events(google_id);
      CREATE INDEX IF NOT EXISTS idx_events_recurring ON events(recurring_event_id);
      CREATE INDEX IF NOT EXISTS idx_events_pending ON events(pending_action) WHERE pending_action IS NOT NULL;

      CREATE TABLE IF NOT EXISTS attendees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        display_name TEXT,
        response_status TEXT,
        is_organizer INTEGER DEFAULT 0,
        is_self INTEGER DEFAULT 0,
        UNIQUE(event_id, email)
      );

      CREATE INDEX IF NOT EXISTS idx_attendees_event ON attendees(event_id);
      CREATE INDEX IF NOT EXISTS idx_attendees_email ON attendees(email);

      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL,
        calendar_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        attempts INTEGER DEFAULT 0,
        last_error TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Migrations — add columns if missing
    try { this.db.exec('ALTER TABLE events ADD COLUMN attachments TEXT'); } catch {}
  }

  private genId(): string {
    return crypto.randomUUID();
  }

  private now(): string {
    return new Date().toISOString();
  }

  // ── Calendar Methods ──────────────────────────────────────

  upsertCalendar(cal: Omit<Calendar, 'created_at' | 'updated_at' | 'sync_token' | 'last_synced_at'>): void {
    this.db.prepare(`
      INSERT INTO calendars (id, summary, description, color_id, color_override, background_color,
                             foreground_color, access_role, primary_calendar, visible, time_zone, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        summary = excluded.summary,
        description = excluded.description,
        color_id = excluded.color_id,
        background_color = excluded.background_color,
        foreground_color = excluded.foreground_color,
        access_role = excluded.access_role,
        primary_calendar = excluded.primary_calendar,
        time_zone = excluded.time_zone,
        updated_at = datetime('now')
    `).run(
      cal.id, cal.summary, cal.description, cal.color_id, cal.color_override,
      cal.background_color, cal.foreground_color, cal.access_role,
      cal.primary_calendar ? 1 : 0, cal.visible ? 1 : 0, cal.time_zone,
    );
  }

  getCalendars(): Calendar[] {
    return (this.db.prepare('SELECT * FROM calendars ORDER BY primary_calendar DESC, summary ASC').all() as any[])
      .map(this.rowToCalendar);
  }

  getVisibleCalendars(): Calendar[] {
    return (this.db.prepare('SELECT * FROM calendars WHERE visible = 1 ORDER BY primary_calendar DESC, summary ASC').all() as any[])
      .map(this.rowToCalendar);
  }

  getCalendar(id: string): Calendar | null {
    const row = this.db.prepare('SELECT * FROM calendars WHERE id = ?').get(id) as any;
    return row ? this.rowToCalendar(row) : null;
  }

  getPrimaryCalendarId(): string | null {
    const row = this.db.prepare('SELECT id FROM calendars WHERE primary_calendar = 1 LIMIT 1').get() as any;
    return row?.id || null;
  }

  updateCalendarVisibility(id: string, visible: boolean): void {
    this.db.prepare('UPDATE calendars SET visible = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(visible ? 1 : 0, id);
  }

  updateCalendarColor(id: string, color: string): void {
    this.db.prepare('UPDATE calendars SET color_override = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(color, id);
  }

  updateCalendarSyncToken(id: string, syncToken: string): void {
    this.db.prepare('UPDATE calendars SET sync_token = ?, last_synced_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?')
      .run(syncToken, id);
  }

  private rowToCalendar(row: any): Calendar {
    return {
      ...row,
      primary_calendar: !!row.primary_calendar,
      visible: !!row.visible,
    };
  }

  // ── Event Methods ─────────────────────────────────────────

  upsertEvent(event: Partial<CalendarEvent> & { google_id: string; calendar_id: string }): string {
    const existing = this.db.prepare('SELECT id FROM events WHERE google_id = ?').get(event.google_id) as any;
    const id = existing?.id || this.genId();

    this.db.prepare(`
      INSERT INTO events (
        id, google_id, calendar_id, summary, description, location,
        start_time, end_time, start_date, end_date, all_day, time_zone,
        status, self_response, organizer_email, organizer_name, is_organizer,
        recurrence_rule, recurring_event_id, html_link, hangout_link,
        conference_data, transparency, visibility, color_id, reminders,
        attachments, etag, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        google_id = excluded.google_id,
        calendar_id = excluded.calendar_id,
        summary = excluded.summary,
        description = excluded.description,
        location = excluded.location,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        all_day = excluded.all_day,
        time_zone = excluded.time_zone,
        status = excluded.status,
        self_response = excluded.self_response,
        organizer_email = excluded.organizer_email,
        organizer_name = excluded.organizer_name,
        is_organizer = excluded.is_organizer,
        recurrence_rule = excluded.recurrence_rule,
        recurring_event_id = excluded.recurring_event_id,
        html_link = excluded.html_link,
        hangout_link = excluded.hangout_link,
        conference_data = excluded.conference_data,
        transparency = excluded.transparency,
        visibility = excluded.visibility,
        color_id = excluded.color_id,
        reminders = excluded.reminders,
        attachments = excluded.attachments,
        etag = excluded.etag,
        updated_at = datetime('now')
    `).run(
      id, event.google_id, event.calendar_id,
      event.summary || null, event.description || null, event.location || null,
      event.start_time || '', event.end_time || '',
      event.start_date || null, event.end_date || null,
      event.all_day ? 1 : 0, event.time_zone || null,
      event.status || 'confirmed', event.self_response || null,
      event.organizer_email || null, event.organizer_name || null,
      event.is_organizer ? 1 : 0,
      event.recurrence_rule || null, event.recurring_event_id || null,
      event.html_link || null, event.hangout_link || null,
      event.conference_data ? JSON.stringify(event.conference_data) : null,
      event.transparency || 'opaque', event.visibility || 'default',
      event.color_id || null,
      event.reminders ? JSON.stringify(event.reminders) : null,
      event.attachments ? JSON.stringify(event.attachments) : null,
      event.etag || null,
    );

    return id;
  }

  upsertAttendees(eventId: string, attendees: Omit<Attendee, 'id'>[]): void {
    this.db.prepare('DELETE FROM attendees WHERE event_id = ?').run(eventId);
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO attendees (event_id, email, display_name, response_status, is_organizer, is_self)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const a of attendees) {
      insert.run(eventId, a.email, a.display_name, a.response_status, a.is_organizer ? 1 : 0, a.is_self ? 1 : 0);
    }
  }

  getEventsInRange(start: string, end: string, calendarIds?: string[]): CalendarEvent[] {
    let query = `
      SELECT e.*, c.background_color as calendar_bg_color, c.color_override as calendar_color_override
      FROM events e
      JOIN calendars c ON e.calendar_id = c.id
      WHERE c.visible = 1
        AND e.status != 'cancelled'
        AND (e.self_response IS NULL OR e.self_response != 'declined')
        AND (
          (e.all_day = 0 AND e.start_time < ? AND e.end_time > ?)
          OR (e.all_day = 1 AND e.start_date < ? AND e.end_date > ?)
        )
    `;
    const params: any[] = [end, start, end, start];

    if (calendarIds && calendarIds.length > 0) {
      const placeholders = calendarIds.map(() => '?').join(',');
      query += ` AND e.calendar_id IN (${placeholders})`;
      params.push(...calendarIds);
    }

    query += ' ORDER BY e.all_day DESC, e.start_time ASC';

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(r => this.rowToEvent(r));
  }

  getEvent(id: string): CalendarEvent | null {
    const row = this.db.prepare(`
      SELECT e.*, c.background_color as calendar_bg_color, c.color_override as calendar_color_override
      FROM events e
      JOIN calendars c ON e.calendar_id = c.id
      WHERE e.id = ?
    `).get(id) as any;
    if (!row) return null;

    const event = this.rowToEvent(row);
    event.attendees = this.getAttendees(id);
    return event;
  }

  getEventByGoogleId(googleId: string): CalendarEvent | null {
    const row = this.db.prepare(`
      SELECT e.*, c.background_color as calendar_bg_color, c.color_override as calendar_color_override
      FROM events e
      JOIN calendars c ON e.calendar_id = c.id
      WHERE e.google_id = ?
    `).get(googleId) as any;
    if (!row) return null;
    const event = this.rowToEvent(row);
    event.attendees = this.getAttendees(event.id);
    return event;
  }

  getAttendees(eventId: string): Attendee[] {
    return this.db.prepare('SELECT * FROM attendees WHERE event_id = ?').all(eventId) as Attendee[];
  }

  createLocalEvent(input: CreateEventInput): CalendarEvent {
    const id = this.genId();
    const calendarId = input.calendar_id || this.getPrimaryCalendarId() || 'primary';
    const now = this.now();

    this.db.prepare(`
      INSERT INTO events (
        id, google_id, calendar_id, summary, description, location,
        start_time, end_time, start_date, end_date, all_day, time_zone,
        status, is_organizer, transparency, visibility, local_only,
        pending_action, pending_payload, created_at, updated_at
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 1, ?, ?, 1, 'create', ?, ?, ?)
    `).run(
      id, calendarId,
      input.summary, input.description || null, input.location || null,
      input.all_day ? '' : input.start, input.all_day ? '' : input.end,
      input.all_day ? input.start : null, input.all_day ? input.end : null,
      input.all_day ? 1 : 0, input.time_zone || null,
      input.transparency || 'opaque', input.visibility || 'default',
      JSON.stringify(input), now, now,
    );

    if (input.attendees) {
      const attendees = input.attendees.map(email => ({
        event_id: id,
        email,
        display_name: null,
        response_status: 'needsAction' as const,
        is_organizer: false,
        is_self: false,
      }));
      this.upsertAttendees(id, attendees);
    }

    return this.getEvent(id)!;
  }

  markEventSynced(localId: string, googleId: string, etag: string | null): void {
    this.db.prepare(`
      UPDATE events SET google_id = ?, etag = ?, local_only = 0, pending_action = NULL, pending_payload = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(googleId, etag, localId);
  }

  markEventPending(id: string, action: 'update' | 'delete', payload?: string): void {
    this.db.prepare(`
      UPDATE events SET pending_action = ?, pending_payload = ?, updated_at = datetime('now') WHERE id = ?
    `).run(action, payload || null, id);
  }

  deleteEvent(id: string): void {
    this.db.prepare('DELETE FROM events WHERE id = ?').run(id);
  }

  deleteCancelledEvent(googleId: string): void {
    const result = this.db.prepare('DELETE FROM events WHERE google_id = ?').run(googleId);
    if (result.changes === 0) {
      console.warn(`[Dagaz Cache] deleteCancelledEvent: no match for google_id=${googleId}`);
    }
  }

  reconcileCalendarEvents(calendarId: string, liveGoogleIds: Set<string>, timeMin: string, timeMax: string): number {
    const localRows = this.db.prepare(`
      SELECT id, google_id FROM events
      WHERE calendar_id = ? AND local_only = 0 AND pending_action IS NULL
        AND (
          (all_day = 0 AND start_time >= ? AND start_time < ?)
          OR (all_day = 1 AND start_date >= ? AND start_date < ?)
        )
    `).all(calendarId, timeMin, timeMax, timeMin.split('T')[0], timeMax.split('T')[0]) as { id: string; google_id: string }[];

    let removed = 0;
    for (const row of localRows) {
      if (row.google_id && !liveGoogleIds.has(row.google_id)) {
        this.db.prepare('DELETE FROM events WHERE id = ?').run(row.id);
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`[Dagaz Cache] Reconciled ${calendarId}: removed ${removed} orphaned events`);
    }
    return removed;
  }

  getPendingEvents(): CalendarEvent[] {
    const rows = this.db.prepare(`
      SELECT e.*, c.background_color as calendar_bg_color, c.color_override as calendar_color_override
      FROM events e
      JOIN calendars c ON e.calendar_id = c.id
      WHERE e.pending_action IS NOT NULL
    `).all() as any[];
    return rows.map(r => this.rowToEvent(r));
  }

  // ── Sync Queue ────────────────────────────────────────────

  enqueueSync(eventId: string, calendarId: string, action: string, payload: any): number {
    const result = this.db.prepare(`
      INSERT INTO sync_queue (event_id, calendar_id, action, payload) VALUES (?, ?, ?, ?)
    `).run(eventId, calendarId, action, JSON.stringify(payload));
    return result.lastInsertRowid as number;
  }

  getSyncQueue(): SyncQueueItem[] {
    return this.db.prepare('SELECT * FROM sync_queue ORDER BY created_at ASC').all() as SyncQueueItem[];
  }

  getSyncQueueCount(): number {
    return (this.db.prepare('SELECT COUNT(*) as c FROM sync_queue').get() as any).c;
  }

  markQueueItemDone(id: number): void {
    this.db.prepare('DELETE FROM sync_queue WHERE id = ?').run(id);
  }

  markQueueItemFailed(id: number, error: string): void {
    this.db.prepare('UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?')
      .run(error, id);
  }

  // ── Settings ──────────────────────────────────────────────

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
    return row?.value || null;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }

  // ── Today / Agenda ────────────────────────────────────────

  getTodayEvents(): CalendarEvent[] {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    return this.getEventsInRange(start, end);
  }

  getAgenda(date: string, days: number = 7): CalendarEvent[] {
    const start = new Date(date);
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    return this.getEventsInRange(start.toISOString(), end.toISOString());
  }

  // ── Helpers ───────────────────────────────────────────────

  /** Search attendees by name or email for contact autocomplete */
  searchContacts(query: string, limit: number = 10): Array<{ email: string; display_name: string | null; count: number }> {
    const pattern = `%${query}%`;
    return this.db.prepare(`
      SELECT email, display_name, COUNT(*) as count
      FROM attendees
      WHERE (email LIKE ? OR display_name LIKE ?)
        AND is_self = 0
      GROUP BY email
      ORDER BY count DESC
      LIMIT ?
    `).all(pattern, pattern, limit) as any[];
  }

  getUpcomingEventCount(minutesAhead: number = 15): number {
    const now = new Date();
    const ahead = new Date(now.getTime() + minutesAhead * 60000);
    return (this.db.prepare(`
      SELECT COUNT(*) as c FROM events e
      JOIN calendars c ON e.calendar_id = c.id
      WHERE c.visible = 1
        AND e.status = 'confirmed'
        AND e.all_day = 0
        AND e.start_time >= ? AND e.start_time <= ?
    `).get(now.toISOString(), ahead.toISOString()) as any).c;
  }

  private rowToEvent(row: any): CalendarEvent {
    return {
      id: row.id,
      google_id: row.google_id,
      calendar_id: row.calendar_id,
      summary: row.summary || '',
      description: row.description || '',
      location: row.location || '',
      start_time: row.start_time,
      end_time: row.end_time,
      start_date: row.start_date,
      end_date: row.end_date,
      all_day: !!row.all_day,
      time_zone: row.time_zone,
      status: row.status || 'confirmed',
      self_response: row.self_response,
      organizer_email: row.organizer_email,
      organizer_name: row.organizer_name,
      is_organizer: !!row.is_organizer,
      recurrence_rule: row.recurrence_rule,
      recurring_event_id: row.recurring_event_id,
      html_link: row.html_link,
      hangout_link: row.hangout_link,
      conference_data: row.conference_data ? JSON.parse(row.conference_data) : null,
      transparency: row.transparency || 'opaque',
      visibility: row.visibility || 'default',
      color_id: row.color_id,
      reminders: row.reminders ? JSON.parse(row.reminders) : null,
      attachments: row.attachments ? JSON.parse(row.attachments) : null,
      etag: row.etag,
      local_only: !!row.local_only,
      pending_action: row.pending_action,
      pending_payload: row.pending_payload,
      created_at: row.created_at,
      updated_at: row.updated_at,
      calendar_color: row.calendar_color_override || row.calendar_bg_color || '#4A9AC2',
    };
  }

  // ── Cleanup ───────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
