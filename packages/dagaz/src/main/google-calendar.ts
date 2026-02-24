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
  FreeBusyResponse, ConferenceData,
} from '../shared/types';

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
  } = {}): Promise<{ events: Array<Partial<CalendarEvent> & { google_id: string; calendar_id: string; attendees?: Attendee[] }>; nextSyncToken?: string }> {
    if (!this.calendar) throw new Error('Not authenticated');

    const params: calendar_v3.Params$Resource$Events$List = {
      calendarId,
      maxResults: opts.maxResults || 2500,
      singleEvents: opts.singleEvents !== false,
      orderBy: opts.singleEvents !== false ? 'startTime' : undefined,
    };
    // @ts-ignore — supportsAttachments is valid but not in all type defs
    params['supportsAttachments'] = true;

    if (opts.syncToken) {
      params.syncToken = opts.syncToken;
    } else {
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

      console.log(`[Dagaz] Fetched ${allItems.length} events from ${calendarId}`);
      const events = allItems.map(item => this.parseGoogleEvent(item, calendarId));
      return { events, nextSyncToken: syncToken };
    } catch (e: any) {
      // If sync token is invalid, do a full sync
      if (e.code === 410 && opts.syncToken) {
        console.log('[Dagaz] Sync token expired, doing full fetch');
        return this.listEvents(calendarId, { ...opts, syncToken: undefined });
      }
      throw e;
    }
  }

  async getEvent(calendarId: string, eventId: string): Promise<Partial<CalendarEvent> & { google_id: string; calendar_id: string }> {
    if (!this.calendar) throw new Error('Not authenticated');
    const res = await this.calendar.events.get({ calendarId, eventId });
    return this.parseGoogleEvent(res.data, calendarId);
  }

  async createEvent(calendarId: string, input: CreateEventInput): Promise<Partial<CalendarEvent> & { google_id: string; calendar_id: string }> {
    if (!this.calendar) throw new Error('Not authenticated');

    const requestBody: calendar_v3.Schema$Event = {
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: input.all_day
        ? { date: input.start.split('T')[0] }
        : { dateTime: input.start, timeZone: input.time_zone },
      end: input.all_day
        ? { date: input.end.split('T')[0] }
        : { dateTime: input.end, timeZone: input.time_zone },
      transparency: input.transparency,
      visibility: input.visibility,
      recurrence: input.recurrence,
    };

    if (input.attendees && input.attendees.length > 0) {
      requestBody.attendees = input.attendees.map(email => ({ email }));
    }

    if (input.reminders && input.reminders.length > 0) {
      requestBody.reminders = {
        useDefault: false,
        overrides: input.reminders.map(r => ({ method: r.method, minutes: r.minutes })),
      };
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

  async updateEvent(calendarId: string, eventId: string, updates: UpdateEventInput): Promise<Partial<CalendarEvent> & { google_id: string; calendar_id: string }> {
    if (!this.calendar) throw new Error('Not authenticated');

    const requestBody: calendar_v3.Schema$Event = {};
    if (updates.summary !== undefined) requestBody.summary = updates.summary;
    if (updates.description !== undefined) requestBody.description = updates.description;
    if (updates.location !== undefined) requestBody.location = updates.location;

    if (updates.start !== undefined || updates.end !== undefined) {
      if (updates.all_day) {
        if (updates.start) requestBody.start = { date: updates.start.split('T')[0] };
        if (updates.end) requestBody.end = { date: updates.end.split('T')[0] };
      } else {
        if (updates.start) requestBody.start = { dateTime: updates.start };
        if (updates.end) requestBody.end = { dateTime: updates.end };
      }
    }

    if (updates.attendees) {
      requestBody.attendees = updates.attendees.map(email => ({ email }));
    }

    if (updates.transparency) requestBody.transparency = updates.transparency;
    if (updates.visibility) requestBody.visibility = updates.visibility;

    const res = await this.calendar.events.patch({
      calendarId,
      eventId,
      requestBody,
      sendUpdates: updates.attendees ? 'all' : 'none',
    });

    return this.parseGoogleEvent(res.data, calendarId);
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
  ): Promise<{ recurringEventId?: string }> {
    if (!this.calendar) throw new Error('Not authenticated');

    const event = await this.calendar.events.get({ calendarId, eventId });

    // For recurring instances, RSVP on the parent event so it applies to the whole series
    const parentId = event.data.recurringEventId;
    const targetId = parentId || eventId;
    const targetEvent = parentId
      ? await this.calendar.events.get({ calendarId, eventId: targetId })
      : event;

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

  async getFreeBusy(calendarIds: string[], timeMin: string, timeMax: string): Promise<FreeBusyResponse> {
    if (!this.calendar) throw new Error('Not authenticated');

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

    return { calendars };
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

    const attendees: Attendee[] = (item.attendees || []).map(a => ({
      event_id: '',
      email: a.email || '',
      display_name: a.displayName || null,
      response_status: (a.responseStatus as any) || 'needsAction',
      is_organizer: a.organizer || false,
      is_self: a.self || false,
    }));

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
  { pattern: /https?:\/\/teams\.microsoft\.com\/[^\s<)"']+/i, name: 'Microsoft Teams' },
  { pattern: /https?:\/\/[\w.-]*zoom\.us\/j\/[^\s<)"']+/i, name: 'Zoom' },
  { pattern: /https?:\/\/[\w.-]*webex\.com\/[^\s<)"']+/i, name: 'Webex' },
];

function extractConferenceFromText(
  description: string,
  location: string,
): ConferenceData | null {
  const text = `${location}\n${description}`;
  for (const { pattern, name } of MEETING_PROVIDERS) {
    const match = text.match(pattern);
    if (match) {
      return {
        conferenceSolution: { name },
        entryPoints: [{ entryPointType: 'video', uri: match[0] }],
      };
    }
  }
  return null;
}
