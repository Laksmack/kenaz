import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { BrowserWindow } from 'electron';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { URL } from 'url';
import { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_URI, CALENDAR_SCOPES } from './oauth-config';
import type {
  CalendarEvent, Calendar, Attendee, CreateEventInput, UpdateEventInput,
  FreeBusyResponse, ConferenceData, AttendeeInput,
} from '../shared/types';

function normalizeAttendeeInput(a: AttendeeInput): { email: string; optional?: boolean } {
  if (typeof a === 'string') return { email: a };
  return { email: a.email, optional: a.optional || undefined };
}

export class GoogleCalendarService {
  private oauth2Client: OAuth2Client;
  private calendar: calendar_v3.Calendar | null = null;
  private tokenPath: string;
  private _isAuthorized: boolean = false;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      OAUTH_CLIENT_ID,
      OAUTH_CLIENT_SECRET,
      OAUTH_REDIRECT_URI,
    );
    this.tokenPath = path.join(app.getPath('userData'), 'google-token.json');
    this.loadToken();
  }

  // ── Auth ──────────────────────────────────────────────────

  private loadToken(): void {
    try {
      // Also check Kenaz's token path since it may already have calendar scopes
      const kenazTokenPath = path.join(app.getPath('userData'), '..', 'Kenaz', 'google-token.json');
      const candidates = [this.tokenPath, kenazTokenPath];

      for (const tokenPath of candidates) {
        if (fs.existsSync(tokenPath)) {
          const token = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
          this.oauth2Client.setCredentials(token);
          this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
          this._isAuthorized = true;

          // Save to our own path if loaded from Kenaz
          if (tokenPath !== this.tokenPath) {
            this.saveToken(token);
          }

          // Set up automatic token refresh
          this.oauth2Client.on('tokens', (newTokens) => {
            const current = this.oauth2Client.credentials;
            const merged = { ...current, ...newTokens };
            this.saveToken(merged);
          });

          console.log('[Dagaz] Loaded Google token from', tokenPath);
          return;
        }
      }
    } catch (e) {
      console.error('[Dagaz] Failed to load token:', e);
    }
  }

  private saveToken(token: any): void {
    try {
      const dir = path.dirname(this.tokenPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.tokenPath, JSON.stringify(token, null, 2));
    } catch (e) {
      console.error('[Dagaz] Failed to save token:', e);
    }
  }

  async authorize(): Promise<{ success: boolean; error?: string }> {
    try {
      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: CALENDAR_SCOPES,
        prompt: 'consent',
      });

      const code = await this.waitForAuthCode(authUrl);
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      this._isAuthorized = true;
      this.saveToken(tokens);

      this.oauth2Client.on('tokens', (newTokens) => {
        const current = this.oauth2Client.credentials;
        const merged = { ...current, ...newTokens };
        this.saveToken(merged);
      });

      return { success: true };
    } catch (e: any) {
      console.error('[Dagaz] Auth error:', e);
      return { success: false, error: e.message };
    }
  }

  private async waitForAuthCode(authUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const redirectUrl = new URL(OAUTH_REDIRECT_URI);
      const port = parseInt(redirectUrl.port) || 8234;

      const server = http.createServer((req, res) => {
        const url = new URL(req.url || '', `http://localhost:${port}`);
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><head><meta charset="utf-8"></head><body><h2>Authorization failed</h2><p>You can close this window.</p></body></html>');
          server.close();
          reject(new Error(`Auth error: ${error}`));
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><head><meta charset="utf-8"></head><body><h2>Dagaz ᛞ authorized!</h2><p>You can close this window.</p></body></html>');
          server.close();
          resolve(code);
          return;
        }

        res.writeHead(400);
        res.end('Missing code');
      });

      server.listen(port, () => {
        const { shell } = require('electron');
        shell.openExternal(authUrl);
      });

      setTimeout(() => {
        server.close();
        reject(new Error('Auth timeout'));
      }, 120000);
    });
  }

  isAuthorized(): boolean {
    return this._isAuthorized;
  }

  getOAuth2Client(): OAuth2Client | null {
    return this._isAuthorized ? this.oauth2Client : null;
  }

  // ── Calendars ─────────────────────────────────────────────

  async listCalendars(): Promise<Calendar[]> {
    if (!this.calendar) throw new Error('Not authenticated');
    const res = await this.calendar.calendarList.list({ minAccessRole: 'reader' });
    return (res.data.items || [])
      .filter(cal => !cal.hidden)
      .map(cal => ({
        id: cal.id || '',
        summary: cal.summary || '',
        description: cal.description || null,
        color_id: cal.colorId || null,
        color_override: null,
        background_color: cal.backgroundColor || null,
        foreground_color: cal.foregroundColor || null,
        access_role: cal.accessRole || 'reader',
        primary_calendar: cal.primary || false,
        visible: cal.selected !== false,
        time_zone: cal.timeZone || null,
        sync_token: null,
        last_synced_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
  }

  // ── Events ────────────────────────────────────────────────

  async listEvents(calendarId: string, opts: {
    timeMin?: string; timeMax?: string; syncToken?: string;
    maxResults?: number; singleEvents?: boolean; noPaginate?: boolean;
    showDeleted?: boolean;
  } = {}): Promise<{ events: Array<Partial<CalendarEvent> & { google_id: string; calendar_id: string; attendees?: Attendee[] }>; nextSyncToken?: string }> {
    if (!this.calendar) throw new Error('Not authenticated');

    const useSingleEvents = opts.singleEvents !== false;
    const params: calendar_v3.Params$Resource$Events$List = {
      calendarId,
      maxResults: opts.maxResults || 2500,
      singleEvents: useSingleEvents,
      showDeleted: opts.showDeleted || undefined,
    };
    // @ts-ignore — supportsAttachments is valid but not in all type defs
    params['supportsAttachments'] = true;

    if (opts.syncToken) {
      // orderBy, timeMin, timeMax are incompatible with syncToken
      params.syncToken = opts.syncToken;
    } else {
      if (useSingleEvents) params.orderBy = 'startTime';
      if (opts.timeMin) params.timeMin = opts.timeMin;
      if (opts.timeMax) params.timeMax = opts.timeMax;
    }

    try {
      const allItems: calendar_v3.Schema$Event[] = [];
      let pageToken: string | undefined;
      let syncToken: string | undefined;

      do {
        const res = await this.calendar.events.list({
          ...params,
          pageToken,
        });
        const items = res.data.items || [];
        allItems.push(...items);
        pageToken = res.data.nextPageToken || undefined;
        syncToken = res.data.nextSyncToken || undefined;
        if (opts.noPaginate) break;
        if (pageToken) {
          console.log(`[Dagaz] Fetching next page for ${calendarId} (${allItems.length} events so far)`);
        }
      } while (pageToken);

      // Filter out special Google event types that aren't real calendar events
      const SKIP_EVENT_TYPES = new Set(['workingLocation', 'focusTime', 'outOfOffice']);
      const filtered = allItems.filter(item => !item.eventType || !SKIP_EVENT_TYPES.has(item.eventType));
      console.log(`[Dagaz] Fetched ${allItems.length} events from ${calendarId} (${allItems.length - filtered.length} working-location/focus/ooo skipped)`);
      const events = filtered.map(item => this.parseGoogleEvent(item, calendarId));
      return { events, nextSyncToken: syncToken };
    } catch (e: any) {
      if (e.code === 410 && opts.syncToken) {
        console.log('[Dagaz] Sync token expired, doing full fetch with showDeleted');
        return this.listEvents(calendarId, { ...opts, syncToken: undefined, showDeleted: true });
      }
      throw e;
    }
  }

  async getEvent(calendarId: string, eventId: string): Promise<Partial<CalendarEvent> & { google_id: string; calendar_id: string }> {
    if (!this.calendar) throw new Error('Not authenticated');
    const res = await this.calendar.events.get({ calendarId, eventId });
    return this.parseGoogleEvent(res.data, calendarId);
  }

  /**
   * Build Google Calendar timed slots while preserving wall-clock intent.
   * For explicit UTC/offset timestamps, convert into local clock time in the
   * provided IANA timezone before sending `dateTime` + `timeZone`.
   */
  private buildTimedSlot(dateTime: string, timeZone?: string): { dateTime: string; timeZone?: string } {
    if (timeZone) {
      const hasExplicitOffset = /([+-]\d{2}:\d{2}|Z)$/.test(dateTime);
      // If an absolute timestamp is provided (e.g. drag/drop uses toISOString),
      // convert it to wall-clock time in the target timezone before sending.
      if (hasExplicitOffset) {
        const asDate = new Date(dateTime);
        if (!Number.isNaN(asDate.getTime())) {
          const fmt = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          });
          const parts = Object.fromEntries(
            fmt.formatToParts(asDate)
              .filter(p => p.type !== 'literal')
              .map(p => [p.type, p.value]),
          ) as Record<string, string>;
          const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
          return { dateTime: local, timeZone };
        }
      }
      // Already a local/floating datetime; keep wall-clock and attach timezone.
      return { dateTime: dateTime.replace(/([+-]\d{2}:\d{2}|Z)$/, ''), timeZone };
    }
    return { dateTime };
  }

  async createEvent(calendarId: string, input: CreateEventInput): Promise<Partial<CalendarEvent> & { google_id: string; calendar_id: string }> {
    if (!this.calendar) throw new Error('Not authenticated');

    const requestBody: calendar_v3.Schema$Event = {
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: input.all_day
        ? { date: input.start.split('T')[0] }
        : this.buildTimedSlot(input.start, input.time_zone),
      end: input.all_day
        ? { date: input.end.split('T')[0] }
        : this.buildTimedSlot(input.end, input.time_zone),
      transparency: input.transparency,
      visibility: input.visibility,
      recurrence: input.recurrence,
    };

    if (input.attendees && input.attendees.length > 0) {
      requestBody.attendees = input.attendees.map(normalizeAttendeeInput);
    }

    if (input.reminders && input.reminders.length > 0) {
      requestBody.reminders = {
        useDefault: false,
        overrides: input.reminders.map(r => ({ method: r.method, minutes: r.minutes })),
      };
    }

    if (input.color_id) {
      requestBody.colorId = input.color_id;
    }

    const conferenceParams: any = {};
    if (input.add_conferencing) {
      conferenceParams.conferenceDataVersion = 1;
      requestBody.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID ? crypto.randomUUID() : `dagaz-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const res = await this.calendar.events.insert({
      calendarId,
      requestBody,
      sendUpdates: input.attendees?.length ? 'all' : 'none',
      ...conferenceParams,
    });

    return this.parseGoogleEvent(res.data, calendarId);
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    updates: UpdateEventInput,
    scope: 'single' | 'all' = 'single',
  ): Promise<Partial<CalendarEvent> & { google_id: string; calendar_id: string }> {
    if (!this.calendar) throw new Error('Not authenticated');

    // "all" means "this and following" for recurring instances.
    if (scope === 'all') {
      const instanceRes = await this.calendar.events.get({ calendarId, eventId });
      const instance = instanceRes.data;
      const parentId = instance.recurringEventId;
      if (parentId) {
        const parentRes = await this.calendar.events.get({ calendarId, eventId: parentId });
        const parent = parentRes.data;
        const boundary = this.getSplitBoundary(instance);

        if (boundary && (parent.recurrence || []).length > 0) {
          const countBefore = await this.countInstancesBeforeBoundary(calendarId, parentId, boundary.boundaryIso);
          const previousRecurrence = this.buildPreviousSeriesRecurrence(parent.recurrence || [], countBefore);
          const futureRecurrence = this.buildFutureSeriesRecurrence(parent.recurrence || [], countBefore);
          const requestBody = this.buildFutureSeriesEvent(parent, instance, updates, futureRecurrence);

          const inserted = await this.calendar.events.insert({
            calendarId,
            requestBody,
            sendUpdates: requestBody.attendees?.length ? 'all' : 'none',
          });

          if (countBefore <= 0) {
            await this.calendar.events.delete({ calendarId, eventId: parentId, sendUpdates: 'none' });
          } else {
            await this.calendar.events.patch({
              calendarId,
              eventId: parentId,
              requestBody: { recurrence: previousRecurrence },
              sendUpdates: 'none',
            });
          }

          return this.parseGoogleEvent(inserted.data, calendarId);
        }
      }
    }

    const requestBody = this.buildUpdateRequestBody(updates);
    const res = await this.calendar.events.patch({
      calendarId,
      eventId,
      requestBody,
      sendUpdates: updates.attendees ? 'all' : 'none',
    });

    return this.parseGoogleEvent(res.data, calendarId);
  }

  private buildUpdateRequestBody(updates: UpdateEventInput): calendar_v3.Schema$Event {
    const requestBody: calendar_v3.Schema$Event = {};
    if (updates.summary !== undefined) requestBody.summary = updates.summary;
    if (updates.description !== undefined) requestBody.description = updates.description;
    if (updates.location !== undefined) requestBody.location = updates.location;

    if (updates.start !== undefined || updates.end !== undefined) {
      if (updates.all_day) {
        if (updates.start) requestBody.start = { date: updates.start.split('T')[0] };
        if (updates.end) requestBody.end = { date: updates.end.split('T')[0] };
      } else {
        if (updates.start) requestBody.start = this.buildTimedSlot(updates.start, updates.time_zone);
        if (updates.end) requestBody.end = this.buildTimedSlot(updates.end, updates.time_zone);
      }
    }

    if (updates.attendees) {
      requestBody.attendees = updates.attendees.map(normalizeAttendeeInput);
    }

    if (updates.reminders && updates.reminders.length > 0) {
      requestBody.reminders = {
        useDefault: false,
        overrides: updates.reminders.map(r => ({ method: r.method, minutes: r.minutes })),
      };
    }

    if (updates.color_id !== undefined) {
      requestBody.colorId = updates.color_id || undefined;
    }

    if (updates.transparency) requestBody.transparency = updates.transparency;
    if (updates.visibility) requestBody.visibility = updates.visibility;
    return requestBody;
  }

  private getSplitBoundary(instance: calendar_v3.Schema$Event): { boundaryIso: string } | null {
    if (instance.originalStartTime?.date) {
      const boundaryDate = instance.originalStartTime.date;
      return { boundaryIso: `${boundaryDate}T00:00:00Z` };
    }

    const original = instance.originalStartTime?.dateTime || instance.start?.dateTime;
    if (!original) return null;
    const d = new Date(original);
    if (Number.isNaN(d.getTime())) return null;
    // Ensure the selected occurrence is excluded from "before" counting.
    d.setMilliseconds(d.getMilliseconds() - 1);
    const boundaryIso = d.toISOString();
    if (!boundaryIso) return null;
    return { boundaryIso };
  }

  private readRRuleCount(recurrence: string[]): number | null {
    const rrule = recurrence.find(line => line.startsWith('RRULE:'));
    if (!rrule) return null;
    const m = rrule.match(/(?:^|;)COUNT=(\d+)(?:;|$)/);
    return m ? parseInt(m[1], 10) : null;
  }

  private mutateRRule(rruleLine: string, updates: Record<string, string | null>): string {
    const body = rruleLine.slice('RRULE:'.length);
    const parts = body.split(';').filter(Boolean);
    const kv = new Map<string, string>();
    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key && value !== undefined) kv.set(key, value);
    }
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) kv.delete(key);
      else kv.set(key, value);
    }
    return `RRULE:${Array.from(kv.entries()).map(([key, value]) => `${key}=${value}`).join(';')}`;
  }

  private buildPreviousSeriesRecurrence(recurrence: string[], countBefore: number): string[] {
    const next = [...recurrence];
    const idx = next.findIndex(line => line.startsWith('RRULE:'));
    if (idx === -1) return next;
    next[idx] = this.mutateRRule(next[idx], { COUNT: String(Math.max(1, countBefore)), UNTIL: null });
    return next;
  }

  private buildFutureSeriesRecurrence(recurrence: string[], countBefore: number): string[] {
    const next = [...recurrence];
    const idx = next.findIndex(line => line.startsWith('RRULE:'));
    if (idx === -1) return next;
    const originalCount = this.readRRuleCount(next);
    if (originalCount === null) return next;
    const remaining = Math.max(1, originalCount - countBefore);
    next[idx] = this.mutateRRule(next[idx], { COUNT: String(remaining) });
    return next;
  }

  private async countInstancesBeforeBoundary(calendarId: string, recurringEventId: string, boundaryIso: string): Promise<number> {
    if (!this.calendar) throw new Error('Not authenticated');
    let pageToken: string | undefined;
    let count = 0;
    do {
      const res = await this.calendar.events.instances({
        calendarId,
        eventId: recurringEventId,
        timeMax: boundaryIso,
        showDeleted: false,
        maxResults: 2500,
        pageToken,
      });
      count += (res.data.items || []).length;
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
    return count;
  }

  private buildFutureSeriesEvent(
    parent: calendar_v3.Schema$Event,
    instance: calendar_v3.Schema$Event,
    updates: UpdateEventInput,
    recurrence: string[],
  ): calendar_v3.Schema$Event {
    const allDay = updates.all_day ?? (!instance.start?.dateTime && !parent.start?.dateTime);
    const event: calendar_v3.Schema$Event = {
      summary: updates.summary ?? parent.summary ?? undefined,
      description: updates.description ?? parent.description ?? undefined,
      location: updates.location ?? parent.location ?? undefined,
      transparency: updates.transparency ?? parent.transparency ?? undefined,
      visibility: updates.visibility ?? parent.visibility ?? undefined,
      recurrence,
      colorId: parent.colorId || undefined,
    };

    if (allDay) {
      event.start = { date: updates.start ? updates.start.split('T')[0] : (instance.start?.date || parent.start?.date || undefined) };
      event.end = { date: updates.end ? updates.end.split('T')[0] : (instance.end?.date || parent.end?.date || undefined) };
    } else {
      const timeZone = updates.time_zone || instance.start?.timeZone || parent.start?.timeZone || undefined;
      const start = updates.start || instance.start?.dateTime || parent.start?.dateTime;
      const end = updates.end || instance.end?.dateTime || parent.end?.dateTime;
      if (start) event.start = this.buildTimedSlot(start, timeZone);
      if (end) event.end = this.buildTimedSlot(end, timeZone);
    }

    if (updates.attendees) {
      event.attendees = updates.attendees.map(normalizeAttendeeInput);
    } else if (parent.attendees && parent.attendees.length > 0) {
      event.attendees = parent.attendees
        .filter(a => !!a.email)
        .map(a => ({ email: a.email!, displayName: a.displayName || undefined, optional: a.optional || undefined }));
    }

    if (updates.reminders) {
      event.reminders = {
        useDefault: false,
        overrides: updates.reminders.map(r => ({ method: r.method, minutes: r.minutes })),
      };
    } else if (parent.reminders) {
      event.reminders = parent.reminders;
    }

    return event;
  }

  async moveEvent(calendarId: string, eventId: string, destinationCalendarId: string): Promise<Partial<CalendarEvent> & { google_id: string; calendar_id: string }> {
    if (!this.calendar) throw new Error('Not authenticated');
    const res = await this.calendar.events.move({
      calendarId,
      eventId,
      destination: destinationCalendarId,
      sendUpdates: 'all',
    });
    return this.parseGoogleEvent(res.data, destinationCalendarId);
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    if (!this.calendar) throw new Error('Not authenticated');
    await this.calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates: 'all',
    });
  }

  async rsvpEvent(
    calendarId: string,
    eventId: string,
    response: 'accepted' | 'declined' | 'tentative',
    scope?: 'single' | 'all',
  ): Promise<{ recurringEventId?: string }> {
    if (!this.calendar) throw new Error('Not authenticated');

    const event = await this.calendar.events.get({ calendarId, eventId });
    const parentId = event.data.recurringEventId;

    // Determine target: single instance or parent series
    let targetId: string;
    let targetEvent: typeof event;

    if (scope === 'single' || !parentId) {
      // RSVP on this instance only (or non-recurring event)
      targetId = eventId;
      targetEvent = event;
    } else {
      // scope === 'all' or undefined: RSVP on the parent so it applies to the whole series
      targetId = parentId;
      targetEvent = await this.calendar.events.get({ calendarId, eventId: targetId });
    }

    const attendees = targetEvent.data.attendees || [];

    let found = false;
    for (const attendee of attendees) {
      if (attendee.self) {
        attendee.responseStatus = response;
        found = true;
        break;
      }
    }

    if (!found) throw new Error('Could not find yourself in the attendee list');

    await this.calendar.events.patch({
      calendarId,
      eventId: targetId,
      sendUpdates: 'all',
      requestBody: { attendees },
    });

    return { recurringEventId: parentId || undefined };
  }

  // ── Availability ──────────────────────────────────────────

  // ── FreeBusy cache (in-memory, 2 min TTL) ──────────────────
  private freeBusyCache = new Map<string, { data: FreeBusyResponse; ts: number }>();
  private static FREEBUSY_TTL_MS = 2 * 60 * 1000;

  private freeBusyCacheKey(calendarIds: string[], timeMin: string, timeMax: string): string {
    return `${[...calendarIds].sort().join(',')}|${timeMin}|${timeMax}`;
  }

  async getFreeBusy(calendarIds: string[], timeMin: string, timeMax: string): Promise<FreeBusyResponse> {
    if (!this.calendar) throw new Error('Not authenticated');

    // Check cache first
    const cacheKey = this.freeBusyCacheKey(calendarIds, timeMin, timeMax);
    const cached = this.freeBusyCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < GoogleCalendarService.FREEBUSY_TTL_MS) {
      return cached.data;
    }

    // Google freebusy requires RFC 3339 datetimes — normalise date-only strings
    const ensureDateTime = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s;

    let res;
    try {
      res = await this.calendar.freebusy.query({
        requestBody: {
          timeMin: ensureDateTime(timeMin),
          timeMax: ensureDateTime(timeMax),
          items: calendarIds.map(id => ({ id })),
        },
      });
    } catch (e: any) {
      // Return stale cache on API failure if available
      if (cached) return cached.data;
      const detail = e.response?.data?.error?.message || e.response?.data?.error || e.message;
      throw new Error(`Google FreeBusy API: ${detail}`);
    }

    const calendars: FreeBusyResponse['calendars'] = {};
    for (const [id, data] of Object.entries(res.data.calendars || {})) {
      calendars[id] = {
        busy: (data.busy || []).map(b => ({
          start: b.start || '',
          end: b.end || '',
        })),
        errors: (data.errors || []).map(e => ({
          domain: e.domain || '',
          reason: e.reason || '',
        })),
      };
    }

    const result: FreeBusyResponse = { calendars };

    // Store in cache and evict stale entries
    this.freeBusyCache.set(cacheKey, { data: result, ts: Date.now() });
    if (this.freeBusyCache.size > 50) {
      const now = Date.now();
      for (const [k, v] of this.freeBusyCache) {
        if (now - v.ts > GoogleCalendarService.FREEBUSY_TTL_MS) this.freeBusyCache.delete(k);
      }
    }

    return result;
  }

  // ── Helpers ───────────────────────────────────────────────

  private parseGoogleEvent(
    item: calendar_v3.Schema$Event,
    calendarId: string,
  ): Partial<CalendarEvent> & { google_id: string; calendar_id: string; attendees?: Attendee[] } {
    const isAllDay = !item.start?.dateTime;

    let conferenceData: ConferenceData | null = null;
    if (item.conferenceData) {
      conferenceData = {
        conferenceId: item.conferenceData.conferenceId || undefined,
        conferenceSolution: item.conferenceData.conferenceSolution
          ? { name: item.conferenceData.conferenceSolution.name || '', iconUri: item.conferenceData.conferenceSolution.iconUri || undefined }
          : undefined,
        entryPoints: item.conferenceData.entryPoints?.map(ep => ({
          entryPointType: ep.entryPointType || '',
          uri: ep.uri || '',
          label: ep.label || undefined,
        })),
      };
    }

    if (!conferenceData && !item.hangoutLink) {
      conferenceData = extractConferenceFromText(
        item.description || '',
        item.location || '',
      );
    }

    const selfAttendee = item.attendees?.find(a => a.self);

    const attendees: Attendee[] = (item.attendees || []).map(a => {
      const proposed = (a as any).proposedNewTime;
      return {
        event_id: '',
        email: a.email || '',
        display_name: a.displayName || null,
        response_status: (a.responseStatus as any) || 'needsAction',
        is_organizer: a.organizer || false,
        is_self: a.self || false,
        optional: a.optional || false,
        proposed_start: proposed?.start?.dateTime || proposed?.start?.date || null,
        proposed_end: proposed?.end?.dateTime || proposed?.end?.date || null,
      };
    });

    return {
      google_id: item.id || '',
      calendar_id: calendarId,
      summary: item.summary || '',
      description: item.description || '',
      location: item.location || '',
      start_time: item.start?.dateTime || item.start?.date || '',
      end_time: item.end?.dateTime || item.end?.date || '',
      start_date: isAllDay ? (item.start?.date || null) : null,
      end_date: isAllDay ? (item.end?.date || null) : null,
      all_day: isAllDay,
      time_zone: item.start?.timeZone || null,
      status: (item.status as any) || 'confirmed',
      self_response: selfAttendee?.responseStatus || null,
      organizer_email: item.organizer?.email || null,
      organizer_name: item.organizer?.displayName || null,
      is_organizer: item.organizer?.self || false,
      recurrence_rule: item.recurrence?.join('\n') || null,
      recurring_event_id: item.recurringEventId || null,
      html_link: item.htmlLink || null,
      hangout_link: item.hangoutLink || null,
      conference_data: conferenceData,
      transparency: (item.transparency as any) || 'opaque',
      visibility: item.visibility || 'default',
      color_id: item.colorId || null,
      reminders: item.reminders?.overrides?.map(r => ({
        method: r.method as 'email' | 'popup',
        minutes: r.minutes || 0,
      })) || null,
      attachments: (item.attachments || []).map(a => ({
        fileUrl: a.fileUrl || '',
        title: a.title || 'Untitled',
        mimeType: a.mimeType || undefined,
        iconLink: a.iconLink || undefined,
        fileId: a.fileId || undefined,
      })),
      etag: item.etag || null,
      attendees,
    };
  }
}

const MEETING_PROVIDERS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /^https?:\/\/teams\.microsoft\.com\//i, name: 'Microsoft Teams' },
  { pattern: /^https?:\/\/[\w.-]*zoom\.us\/j\//i, name: 'Zoom' },
  { pattern: /^https?:\/\/[\w.-]*webex\.com\//i, name: 'Webex' },
];
const URL_CANDIDATE_RE = /https?:\/\/[^\s<>"']+/gi;

function normalizeExtractedUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^[<([{]+/, '')
    .replace(/[>)\]}.,;:!?]+$/, '');
}

function pickProviderUrl(providerName: string, urls: string[]): string | null {
  const matching = urls.filter((u) => {
    const provider = MEETING_PROVIDERS.find((p) => p.name === providerName);
    return provider ? provider.pattern.test(u) : false;
  });
  if (matching.length === 0) return null;

  // Teams invites often include multiple URLs; prefer the actual meeting join URL.
  if (providerName === 'Microsoft Teams') {
    const join = matching.find((u) => /\/l\/meetup-join\//i.test(u));
    if (join) return join;
  }
  return matching[0];
}

function extractConferenceFromText(
  description: string,
  location: string,
): ConferenceData | null {
  const text = `${location}\n${description}`;
  const uniqueUrls = Array.from(new Set(
    Array.from(text.matchAll(URL_CANDIDATE_RE))
      .map((m) => normalizeExtractedUrl(m[0]))
      .filter(Boolean)
  ));

  for (const { name } of MEETING_PROVIDERS) {
    const uri = pickProviderUrl(name, uniqueUrls);
    if (uri) {
      return {
        conferenceSolution: { name },
        entryPoints: [{ entryPointType: 'video', uri }],
      };
    }
  }
  return null;
}
