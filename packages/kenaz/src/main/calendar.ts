import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import type { CalendarEvent } from '../shared/types';

export class CalendarService {
  private oauth2Client: OAuth2Client | null = null;
  private calendar: calendar_v3.Calendar | null = null;

  setAuth(oauth2Client: OAuth2Client) {
    this.oauth2Client = oauth2Client;
    this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  }

  isReady(): boolean {
    return this.calendar !== null;
  }

  async getTodayEvents(excludedIds: string[] = []): Promise<CalendarEvent[]> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    return this.getEventsInRange(startOfDay.toISOString(), endOfDay.toISOString(), excludedIds);
  }

  async listCalendars(): Promise<Array<{ id: string; name: string; color: string }>> {
    if (!this.calendar) throw new Error('Calendar not authenticated');
    const calList = await this.calendar.calendarList.list({ minAccessRole: 'reader' });
    return (calList.data.items || [])
      .filter((cal) => !cal.hidden && cal.selected !== false)
      .map((cal) => ({
        id: cal.id || '',
        name: cal.summary || cal.id || '',
        color: cal.backgroundColor || '#4361ee',
      }));
  }

  async getEventsInRange(timeMin: string, timeMax: string, excludedIds: string[] = []): Promise<CalendarEvent[]> {
    if (!this.calendar) throw new Error('Calendar not authenticated');

    try {
      // First get list of visible calendars
      const calList = await this.calendar.calendarList.list({
        minAccessRole: 'reader',
      });

      const calendars = calList.data.items || [];
      const allEvents: CalendarEvent[] = [];

      // Fetch events from each calendar in parallel
      const eventPromises = calendars
        .filter((cal) => !cal.hidden && cal.selected !== false && !excludedIds.includes(cal.id!))
        .map(async (cal) => {
          try {
            const res = await this.calendar!.events.list({
              calendarId: cal.id!,
              timeMin,
              timeMax,
              singleEvents: true,
              orderBy: 'startTime',
              maxResults: 50,
            });

            const color = cal.backgroundColor || '#4361ee';
            return (res.data.items || []).map((event) => this.parseEvent(event, color));
          } catch (e) {
            console.error(`Failed to fetch events from calendar ${cal.summary}:`, e);
            return [];
          }
        });

      const results = await Promise.all(eventPromises);
      for (const events of results) {
        allEvents.push(...events);
      }

      // Sort by start time
      allEvents.sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return new Date(a.start).getTime() - new Date(b.start).getTime();
      });

      return allEvents;
    } catch (e: any) {
      console.error('[Calendar] Failed to fetch events:', e.message);
      return [];
    }
  }

  /**
   * RSVP to a calendar event.
   * @param eventId - The Google Calendar event ID
   * @param response - 'accepted' | 'tentative' | 'declined'
   * @param calendarId - Calendar ID (defaults to 'primary')
   */
  async rsvpEvent(eventId: string, response: 'accepted' | 'tentative' | 'declined', calendarId: string = 'primary'): Promise<{ success: boolean; status: string }> {
    if (!this.calendar) throw new Error('Calendar not authenticated');

    // Get the current event
    const event = await this.calendar.events.get({
      calendarId,
      eventId,
    });

    const attendees = event.data.attendees || [];
    // Find 'self' attendee and update their response
    let found = false;
    for (const attendee of attendees) {
      if (attendee.self) {
        attendee.responseStatus = response;
        found = true;
        break;
      }
    }

    if (!found) {
      throw new Error('Could not find yourself in the attendee list');
    }

    // Patch only the attendees field, send notification to organizer
    await this.calendar.events.patch({
      calendarId,
      eventId,
      sendUpdates: 'all', // Sends RSVP notification to organizer
      requestBody: {
        attendees,
      },
    });

    return { success: true, status: response };
  }

  /**
   * Find a calendar event by iCalUID (from email invite headers).
   * Returns the event ID if found.
   */
  async findEventByICalUID(iCalUID: string, calendarId: string = 'primary'): Promise<string | null> {
    if (!this.calendar) throw new Error('Calendar not authenticated');

    try {
      const res = await this.calendar.events.list({
        calendarId,
        iCalUID,
        maxResults: 1,
      });
      const items = res.data.items || [];
      return items.length > 0 ? items[0].id || null : null;
    } catch {
      return null;
    }
  }

  /**
   * Create a personal copy of an event from ICS — same time, dial-in, etc.,
   * but as a new event with no attendees (so you can't RSVP to the original).
   * Uses events.insert, not import.
   */
  async createCopyFromIcs(rawIcsText: string, calendarId: string = 'primary'): Promise<string | null> {
    if (!this.calendar) throw new Error('Calendar not authenticated');

    const icsText = rawIcsText.replace(/\r?\n[ \t]/g, '');
    const summary = icsText.match(/^SUMMARY[^:]*:(.+)$/m)?.[1]?.trim();
    const location = icsText.match(/^LOCATION[^:]*:(.+)$/m)?.[1]?.trim();
    const description = icsText.match(/^DESCRIPTION[^:]*:(.+)$/m)?.[1]?.trim()?.replace(/\\n/g, '\n');
    const organizerLine = icsText.match(/^ORGANIZER[^:]*:(.+)$/m)?.[1]?.trim();
    const organizerName = icsText.match(/^ORGANIZER[^:]*CN=([^;:]+)[^:]*:/m)?.[1]?.trim();
    const dtstart = icsText.match(/^DTSTART[^:]*:(.+)$/m)?.[1]?.trim();
    const dtend = icsText.match(/^DTEND[^:]*:(.+)$/m)?.[1]?.trim();

    const tzidMatch = icsText.match(/DTSTART[^;]*;TZID=([^:]+):/);
    const tzid = tzidMatch?.[1]?.trim();
    const TZID_TO_IANA: Record<string, string> = {
      'Pacific Standard Time': 'America/Los_Angeles',
      'Eastern Standard Time': 'America/New_York',
      'Central Standard Time': 'America/Chicago',
      'Mountain Standard Time': 'America/Denver',
      'GMT Standard Time': 'Europe/London',
      'W. Europe Standard Time': 'Europe/Berlin',
      'Central European Standard Time': 'Europe/Paris',
    };
    const timeZone = tzid && TZID_TO_IANA[tzid] ? TZID_TO_IANA[tzid] : undefined;

    if (!dtstart) return null;

    const parseIcsDt = (dt: string): { date: string } | { dateTime: string; timeZone?: string } | null => {
      if (dt.length === 8) {
        return { date: `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` };
      }
      const m = dt.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/);
      if (!m) return null;
      const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${dt.endsWith('Z') ? 'Z' : ''}`;
      return timeZone ? { dateTime: iso, timeZone } : { dateTime: iso };
    };

    const start = parseIcsDt(dtstart);
    const end = dtend ? parseIcsDt(dtend) : start;
    if (!start || !end) return null;

    const attendeeNotes: string[] = [];
    const attendeeRegex = /^ATTENDEE[^:]*:mailto:([^\r\n]+)/gm;
    let match: RegExpExecArray | null;
    while ((match = attendeeRegex.exec(icsText)) !== null) {
      const fullLine = match[0];
      const email = match[1].trim();
      const name = fullLine.match(/CN=([^;:]+)/)?.[1]?.trim();
      attendeeNotes.push(name ? `${name} <${email}>` : email);
    }
    const organizerNote = organizerLine
      ? (organizerName ? `${organizerName} <${organizerLine.replace(/^mailto:/i, '')}>` : organizerLine.replace(/^mailto:/i, ''))
      : null;
    let finalDescription = description || '';
    const peopleSection: string[] = [];
    if (organizerNote) peopleSection.push(`Organizer: ${organizerNote}`);
    if (attendeeNotes.length > 0) {
      peopleSection.push('Original attendees:');
      for (const a of attendeeNotes) peopleSection.push(`- ${a}`);
    }
    if (peopleSection.length > 0) {
      finalDescription = finalDescription ? `${finalDescription}\n\n---\n${peopleSection.join('\n')}` : peopleSection.join('\n');
    }

    try {
      const res = await this.calendar.events.insert({
        calendarId,
        requestBody: {
          summary: summary || 'Imported Event',
          start,
          end,
          location: location || undefined,
          description: finalDescription || undefined,
        },
      });
      console.log(`[Calendar] Created copy from ICS: ${res.data.id}`);
      return res.data.id || null;
    } catch (e: any) {
      console.error('[Calendar] Failed to create copy from ICS:', e.message);
      return null;
    }
  }

  /**
   * Import an event from ICS text into Google Calendar.
   * Uses the events.import endpoint which won't send notifications.
   * Returns the Google Calendar event ID if successful.
   */
  async importIcsEvent(rawIcsText: string, calendarId: string = 'primary'): Promise<string | null> {
    if (!this.calendar) throw new Error('Calendar not authenticated');

    // Unfold RFC 5545 continuation lines (lines starting with space/tab)
    const icsText = rawIcsText.replace(/\r?\n[ \t]/g, '');

    const uid = icsText.match(/^UID:(.+)$/m)?.[1]?.trim();
    const summary = icsText.match(/^SUMMARY[^:]*:(.+)$/m)?.[1]?.trim();
    const location = icsText.match(/^LOCATION[^:]*:(.+)$/m)?.[1]?.trim();
    const description = icsText.match(/^DESCRIPTION[^:]*:(.+)$/m)?.[1]?.trim()?.replace(/\\n/g, '\n');
    const organizerLine = icsText.match(/^ORGANIZER[^:]*:(.+)$/m)?.[1]?.trim();
    const organizerName = icsText.match(/^ORGANIZER[^:]*CN=([^;:]+)[^:]*:/m)?.[1]?.trim();
    const dtstartLine = icsText.match(/^DTSTART[^:]*:(.+)$/m);
    const dtendLine = icsText.match(/^DTEND[^:]*:(.+)$/m);
    const dtstart = dtstartLine?.[1]?.trim();
    const dtend = dtendLine?.[1]?.trim();

    const tzidMatch = icsText.match(/DTSTART[^;]*;TZID=([^:]+):/);
    const tzid = tzidMatch?.[1]?.trim();
    const TZID_TO_IANA: Record<string, string> = {
      'Pacific Standard Time': 'America/Los_Angeles',
      'Eastern Standard Time': 'America/New_York',
      'Central Standard Time': 'America/Chicago',
      'Mountain Standard Time': 'America/Denver',
      'GMT Standard Time': 'Europe/London',
      'W. Europe Standard Time': 'Europe/Berlin',
      'Central European Standard Time': 'Europe/Paris',
    };
    const timeZone = tzid && TZID_TO_IANA[tzid] ? TZID_TO_IANA[tzid] : undefined;

    if (!uid || !dtstart) return null;

    const parseIcsDt = (dt: string): { date: string } | { dateTime: string; timeZone?: string } | null => {
      if (dt.length === 8) {
        return { date: `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` };
      }
      const m = dt.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/);
      if (!m) return null;
      const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${dt.endsWith('Z') ? 'Z' : ''}`;
      return timeZone ? { dateTime: iso, timeZone } : { dateTime: iso };
    };

    const start = parseIcsDt(dtstart);
    const end = dtend ? parseIcsDt(dtend) : start;
    if (!start || !end) return null;

    const attendeeNotes: string[] = [];
    const attendeeRegex = /^ATTENDEE[^:]*:mailto:([^\r\n]+)/gm;
    let match: RegExpExecArray | null;
    while ((match = attendeeRegex.exec(icsText)) !== null) {
      const fullLine = match[0];
      const email = match[1].trim();
      const name = fullLine.match(/CN=([^;:]+)/)?.[1]?.trim();
      attendeeNotes.push(name ? `${name} <${email}>` : email);
    }

    const organizerNote = organizerLine
      ? (organizerName ? `${organizerName} <${organizerLine.replace(/^mailto:/i, '')}>` : organizerLine.replace(/^mailto:/i, ''))
      : null;

    let finalDescription = description || '';
    const peopleSection: string[] = [];
    if (organizerNote) peopleSection.push(`Organizer: ${organizerNote}`);
    if (attendeeNotes.length > 0) {
      peopleSection.push('Original attendees:');
      for (const attendee of attendeeNotes) peopleSection.push(`- ${attendee}`);
    }
    if (peopleSection.length > 0) {
      finalDescription = finalDescription
        ? `${finalDescription}\n\n---\n${peopleSection.join('\n')}`
        : peopleSection.join('\n');
    }

    try {
      const res = await this.calendar.events.import({
        calendarId,
        requestBody: {
          iCalUID: uid,
          summary: summary || 'Imported Event',
          start,
          end,
          location: location || undefined,
          description: finalDescription || undefined,
        },
      });
      console.log(`[Calendar] Imported event from ICS: ${res.data.id}`);
      return res.data.id || null;
    } catch (e: any) {
      console.error('[Calendar] Failed to import ICS event:', e.message);
      return null;
    }
  }

  private parseEvent(event: calendar_v3.Schema$Event, calendarColor: string): CalendarEvent {
    const isAllDay = !event.start?.dateTime;
    const start = event.start?.dateTime || event.start?.date || '';
    const end = event.end?.dateTime || event.end?.date || '';

    // Extract meet link from conferenceData or hangoutLink
    let meetLink = event.hangoutLink || '';
    if (event.conferenceData?.entryPoints) {
      const videoEntry = event.conferenceData.entryPoints.find((ep) => ep.entryPointType === 'video');
      if (videoEntry?.uri) meetLink = videoEntry.uri;
    }

    return {
      id: event.id || '',
      summary: event.summary || '(No title)',
      description: event.description || '',
      location: event.location || '',
      start,
      end,
      allDay: isAllDay,
      hangoutLink: event.hangoutLink || '',
      meetLink,
      status: (event.status as any) || 'confirmed',
      attendees: (event.attendees || []).map((a) => ({
        email: a.email || '',
        name: a.displayName || a.email || '',
        self: a.self || false,
        responseStatus: a.responseStatus || 'needsAction',
      })),
      calendarColor,
    };
  }
}
