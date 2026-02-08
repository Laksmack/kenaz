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

  async getTodayEvents(): Promise<CalendarEvent[]> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    return this.getEventsInRange(startOfDay.toISOString(), endOfDay.toISOString());
  }

  async getEventsInRange(timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
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
        .filter((cal) => !cal.hidden && cal.selected !== false)
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
