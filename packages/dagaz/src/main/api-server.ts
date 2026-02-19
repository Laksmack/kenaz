import express from 'express';
import { z } from 'zod';
import * as chrono from 'chrono-node';
import type { CacheStore } from './cache-store';
import type { GoogleCalendarService } from './google-calendar';
import type { SyncEngine } from './sync-engine';
import type { ConnectivityMonitor } from './connectivity';
import type { CreateEventInput, UpdateEventInput } from '../shared/types';

export function startApiServer(
  cache: CacheStore,
  google: GoogleCalendarService,
  sync: SyncEngine,
  connectivity: ConnectivityMonitor,
  port: number,
) {
  const app = express();
  app.use(express.json());

  // ── Validation Schemas ────────────────────────────────────

  const createEventSchema = z.object({
    summary: z.string().min(1),
    description: z.string().optional(),
    location: z.string().optional(),
    start: z.string(),
    end: z.string(),
    all_day: z.boolean().optional(),
    time_zone: z.string().optional(),
    attendees: z.array(z.string().email()).optional(),
    calendar_id: z.string().optional(),
    add_conferencing: z.boolean().optional(),
    recurrence: z.array(z.string()).optional(),
    transparency: z.enum(['opaque', 'transparent']).optional(),
    visibility: z.string().optional(),
  });

  const updateEventSchema = z.object({
    summary: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    all_day: z.boolean().optional(),
    attendees: z.array(z.string().email()).optional(),
    transparency: z.enum(['opaque', 'transparent']).optional(),
    visibility: z.string().optional(),
  });

  const rsvpSchema = z.object({
    response: z.enum(['accepted', 'declined', 'tentative']),
  });

  const parseEventSchema = z.object({
    text: z.string().min(1),
  });

  // ── Helper: resolve event by local ID or google_id ────────

  function resolveEvent(id: string) {
    return cache.getEvent(id) || cache.getEventByGoogleId(id);
  }

  // ── Helper: archive invite email in Kenaz ─────────────────

  const KENAZ_API = 'http://localhost:3141';

  async function archiveInviteInKenaz(eventSummary: string): Promise<void> {
    try {
      // Check if Kenaz is running and has archiveOnReply enabled
      const cfgRes = await fetch(`${KENAZ_API}/api/config`, { signal: AbortSignal.timeout(2000) });
      if (!cfgRes.ok) return;
      const cfg = await cfgRes.json();
      if (!cfg.archiveOnReply) return;

      // Search for the calendar invite email by subject
      const q = encodeURIComponent(`subject:"${eventSummary}" invite OR invitation`);
      const searchRes = await fetch(`${KENAZ_API}/api/search?q=${q}`, { signal: AbortSignal.timeout(5000) });
      if (!searchRes.ok) return;
      const { threads } = await searchRes.json();
      if (!threads || threads.length === 0) return;

      // Archive the first matching thread (the invite)
      const threadId = threads[0].id;
      await fetch(`${KENAZ_API}/api/archive/${threadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      console.log(`[Dagaz] Archived invite email for "${eventSummary}" in Kenaz (thread ${threadId})`);
    } catch {
      // Kenaz not running or error — silently ignore
    }
  }

  // ── Helper: parse natural language event ──────────────────

  function parseNaturalLanguage(text: string): {
    summary: string; start: string; end: string;
    location?: string; attendees?: string[];
  } | null {
    const results = chrono.parse(text, new Date(), { forwardDate: true });
    if (results.length === 0) return null;

    const parsed = results[0];
    const start = parsed.start.date();
    const end = parsed.end ? parsed.end.date() : new Date(start.getTime() + 60 * 60 * 1000);

    // Extract location: "at <place>" pattern
    let location: string | undefined;
    const atMatch = text.match(/\bat\s+([A-Z][^,]*?)(?:\s+(?:on|from|at|for)\s|$)/i);
    if (atMatch) {
      const potentialLocation = atMatch[1].trim();
      // Only treat as location if it's not a time expression
      if (!chrono.parse(potentialLocation).length) {
        location = potentialLocation;
      }
    }

    // Extract emails for attendees
    const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
    const attendees = text.match(emailRegex) || undefined;

    // Build summary: remove date/time text and emails
    let summary = text;
    if (parsed.text) summary = summary.replace(parsed.text, '').trim();
    if (attendees) attendees.forEach(e => { summary = summary.replace(e, '').trim(); });
    if (location) summary = summary.replace(new RegExp(`\\bat\\s+${location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '').trim();
    summary = summary.replace(/\s*(with|for)\s*$/i, '').trim();
    summary = summary.replace(/^\s*(with|for)\s*/i, '').trim();
    if (!summary) summary = 'New Event';

    return {
      summary,
      start: start.toISOString(),
      end: end.toISOString(),
      location,
      attendees,
    };
  }

  // ── Calendars ─────────────────────────────────────────────

  app.get('/api/calendars', (_req, res) => {
    try {
      const calendars = cache.getCalendars();
      res.json({ calendars });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/calendars/:id', (req, res) => {
    try {
      const { id } = req.params;
      if (req.body.visible !== undefined) {
        cache.updateCalendarVisibility(id, req.body.visible);
      }
      if (req.body.color_override) {
        cache.updateCalendarColor(id, req.body.color_override);
      }
      const updated = cache.getCalendar(id);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Events ────────────────────────────────────────────────

  app.get('/api/events', (req, res) => {
    try {
      const start = req.query.start as string;
      const end = req.query.end as string;
      if (!start || !end) {
        return res.status(400).json({ error: 'start and end query params required' });
      }
      const calendarId = req.query.calendar as string | undefined;
      const calendarIds = calendarId ? [calendarId] : undefined;
      const events = cache.getEventsInRange(start, end, calendarIds);
      res.json({ events });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/events/:id', (req, res) => {
    try {
      const event = resolveEvent(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });
      res.json(event);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/events', async (req, res) => {
    try {
      const parsed = createEventSchema.parse(req.body);
      const calendarId = parsed.calendar_id || cache.getPrimaryCalendarId() || 'primary';

      // Auto-detect all-day if date-only strings are passed (YYYY-MM-DD, no T)
      if (parsed.all_day === undefined && parsed.start && parsed.end) {
        const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
        if (dateOnly.test(parsed.start) && dateOnly.test(parsed.end)) {
          (parsed as any).all_day = true;
        }
      }

      // Auto-add organizer to attendees so they appear in the guest list
      const selfEmail = cache.getPrimaryCalendarId();
      if (selfEmail && parsed.attendees && parsed.attendees.length > 0) {
        const lower = selfEmail.toLowerCase();
        if (!parsed.attendees.some(e => e.toLowerCase() === lower)) {
          parsed.attendees.push(selfEmail);
        }
      }

      if (connectivity.isOnline && google.isAuthorized()) {
        const result = await google.createEvent(calendarId, parsed);
        const localId = cache.upsertEvent(result);
        if (result.attendees) {
          cache.upsertAttendees(localId, result.attendees.map(a => ({ ...a, event_id: localId })));
        }
        const event = cache.getEvent(localId);
        res.json(event);
      } else {
        const event = cache.createLocalEvent(parsed);
        cache.enqueueSync(event.id, calendarId, 'create', parsed);
        res.json(event);
      }
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: e.errors });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/events/:id', async (req, res) => {
    try {
      const updates = updateEventSchema.parse(req.body);
      const event = resolveEvent(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      if (connectivity.isOnline && google.isAuthorized() && event.google_id) {
        const result = await google.updateEvent(event.calendar_id, event.google_id, updates);
        cache.upsertEvent(result);
        if (result.attendees) {
          cache.upsertAttendees(event.id, result.attendees.map(a => ({ ...a, event_id: event.id })));
        }
      } else {
        // Update locally and queue for sync
        cache.markEventPending(event.id, 'update', JSON.stringify(updates));
        if (event.google_id) {
          cache.enqueueSync(event.google_id, event.calendar_id, 'update', updates);
        }
      }

      const updated = resolveEvent(req.params.id);
      res.json(updated);
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: e.errors });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/events/:id', async (req, res) => {
    try {
      const event = resolveEvent(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      if (connectivity.isOnline && google.isAuthorized() && event.google_id) {
        await google.deleteEvent(event.calendar_id, event.google_id);
        cache.deleteEvent(event.id);
      } else {
        if (event.google_id) {
          cache.markEventPending(event.id, 'delete');
          cache.enqueueSync(event.google_id, event.calendar_id, 'delete', {});
        } else {
          cache.deleteEvent(event.id);
        }
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/events/:id/rsvp', async (req, res) => {
    try {
      const { response } = rsvpSchema.parse(req.body);
      const event = resolveEvent(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      if (connectivity.isOnline && google.isAuthorized() && event.google_id) {
        await google.rsvpEvent(event.calendar_id, event.google_id, response);
        // Re-fetch to update cache
        const updated = await google.getEvent(event.calendar_id, event.google_id);
        cache.upsertEvent(updated);

        // Cross-app: archive invite email in Kenaz if "Archive on Reply" is enabled
        archiveInviteInKenaz(event.summary || '').catch(() => {});
      } else if (event.google_id) {
        cache.enqueueSync(event.google_id, event.calendar_id, 'rsvp', { response });
      }

      res.json({ success: true, response });
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: e.errors });
      }
      res.status(500).json({ error: e.message });
    }
  });

  // ── Agenda / Today ────────────────────────────────────────

  app.get('/api/agenda', (req, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const days = parseInt(req.query.days as string) || 7;
      const events = cache.getAgenda(date, days);
      res.json({ events });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/today', (_req, res) => {
    try {
      const events = cache.getTodayEvents();
      res.json({ events });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Free/Busy ─────────────────────────────────────────────

  app.get('/api/freebusy', async (req, res) => {
    try {
      const calendars = (req.query.calendars as string || '').split(',').filter(Boolean);
      const start = req.query.start as string;
      const end = req.query.end as string;
      if (!calendars.length || !start || !end) {
        return res.status(400).json({ error: 'calendars, start, and end params required' });
      }
      const result = await google.getFreeBusy(calendars, start, end);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Sync ──────────────────────────────────────────────────

  app.get('/api/sync/status', (_req, res) => {
    res.json({
      status: sync.getStatus(),
      lastSync: sync.getLastSync(),
      pendingCount: sync.getPendingCount(),
    });
  });

  app.post('/api/sync/trigger', async (_req, res) => {
    try {
      await sync.fullSync();
      res.json({ success: true, status: sync.getStatus() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Integration: Day Plan (Dagaz events + Raidō tasks) ─────

  app.get('/api/day-plan', async (req, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const start = new Date(date);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const events = cache.getEventsInRange(start.toISOString(), end.toISOString());

      // Try to fetch tasks from Raidō
      let tasks: any[] = [];
      try {
        const raidoRes = await fetch('http://localhost:3142/api/today', {
          signal: AbortSignal.timeout(3000),
        });
        if (raidoRes.ok) {
          const data = await raidoRes.json();
          tasks = data.tasks || [];
        }
      } catch {
        // Raidō not available — degrade gracefully
      }

      res.json({ events, tasks, date });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Integration: Event Context (attendee emails + HubSpot) ─

  app.get('/api/events/:id/context', async (req, res) => {
    try {
      const event = resolveEvent(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      const attendees = event.attendees || [];
      const externalAttendees = attendees.filter(a => !a.is_self);

      const context: any = { event, emailThreads: [], hubspotContacts: [] };

      // Fetch email threads from Kenaz for each external attendee
      for (const attendee of externalAttendees.slice(0, 5)) {
        try {
          const kenazRes = await fetch(
            `http://localhost:3141/api/search?q=${encodeURIComponent(`from:${attendee.email}`)}`,
            { signal: AbortSignal.timeout(3000) },
          );
          if (kenazRes.ok) {
            const data = await kenazRes.json();
            const threads = (Array.isArray(data) ? data : data.threads || []).slice(0, 5);
            if (threads.length > 0) {
              context.emailThreads.push({
                attendee_email: attendee.email,
                attendee_name: attendee.display_name || attendee.email,
                threads,
              });
            }
          }
        } catch {
          // Kenaz not available
        }

        // Fetch HubSpot contact via Kenaz proxy
        try {
          const hubspotRes = await fetch(
            `http://localhost:3141/api/hubspot/contact/${encodeURIComponent(attendee.email)}`,
            { signal: AbortSignal.timeout(3000) },
          );
          if (hubspotRes.ok) {
            const hubspotData = await hubspotRes.json();
            if (hubspotData.contact) {
              context.hubspotContacts.push({
                attendee_email: attendee.email,
                ...hubspotData,
              });
            }
          }
        } catch {
          // HubSpot not available
        }
      }

      res.json(context);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Settings ──────────────────────────────────────────────

  app.get('/api/settings', (_req, res) => {
    res.json({ message: 'Settings managed via IPC' });
  });

  // ── Analytics ──────────────────────────────────────────────

  app.get('/api/analytics', (req, res) => {
    try {
      const start = req.query.start as string;
      const end = req.query.end as string;
      const groupBy = (req.query.group_by as string) || 'category';

      if (!start || !end) {
        return res.status(400).json({ error: 'start and end params required' });
      }

      const events = cache.getEventsInRange(start, end);

      // Calculate total hours
      const totalMinutes = events.reduce((sum, e) => {
        if (e.all_day) return sum;
        const s = new Date(e.start_time).getTime();
        const en = new Date(e.end_time).getTime();
        return sum + (en - s) / 60000;
      }, 0);

      const analysis: any = {
        totalEvents: events.length,
        totalHours: Math.round(totalMinutes / 60 * 10) / 10,
        breakdown: {} as Record<string, { count: number; hours: number }>,
      };

      // Group events
      for (const event of events) {
        if (event.all_day) continue;
        const duration = (new Date(event.end_time).getTime() - new Date(event.start_time).getTime()) / 3600000;

        let key = '';
        switch (groupBy) {
          case 'category': {
            const title = (event.summary || '').toLowerCase();
            if (title.includes('1:1') || title.includes('one-on-one')) key = '1:1';
            else if (title.includes('standup') || title.includes('daily')) key = 'standup';
            else if (event.attendees && event.attendees.length > 3) key = 'large meeting';
            else if (!event.attendees || event.attendees.length <= 1) key = 'focus time';
            else key = 'meeting';
            break;
          }
          case 'calendar':
            key = event.calendar_id;
            break;
          case 'attendee':
            if (event.attendees && event.attendees.length > 0) {
              for (const a of event.attendees.filter(a => !a.is_self)) {
                const aKey = a.display_name || a.email;
                if (!analysis.breakdown[aKey]) analysis.breakdown[aKey] = { count: 0, hours: 0 };
                analysis.breakdown[aKey].count++;
                analysis.breakdown[aKey].hours = Math.round((analysis.breakdown[aKey].hours + duration) * 10) / 10;
              }
              continue;
            }
            key = 'solo';
            break;
          case 'day': {
            const day = new Date(event.start_time).toLocaleDateString('en-US', { weekday: 'long' });
            key = day;
            break;
          }
          default:
            key = 'other';
        }

        if (!analysis.breakdown[key]) analysis.breakdown[key] = { count: 0, hours: 0 };
        analysis.breakdown[key].count++;
        analysis.breakdown[key].hours = Math.round((analysis.breakdown[key].hours + duration) * 10) / 10;
      }

      res.json(analysis);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Find Meeting Time ─────────────────────────────────────

  app.get('/api/find-meeting-time', async (req, res) => {
    try {
      const attendeesParam = req.query.attendees as string;
      const durationMinutes = parseInt(req.query.duration_minutes as string) || 60;
      const start = req.query.start as string;
      const end = req.query.end as string;

      if (!attendeesParam || !start || !end) {
        return res.status(400).json({ error: 'attendees, start, and end params required' });
      }

      const attendeeEmails = attendeesParam.split(',').filter(Boolean);
      const freeBusy = await google.getFreeBusy(attendeeEmails, start, end);

      // Find overlapping free slots
      const startTime = new Date(start).getTime();
      const endTime = new Date(end).getTime();
      const slotSize = durationMinutes * 60000;
      const suggestions: Array<{ start: string; end: string; score: number }> = [];

      for (let t = startTime; t + slotSize <= endTime; t += 15 * 60000) {
        const slotStart = new Date(t);
        const slotEnd = new Date(t + slotSize);

        // Skip weekends
        const day = slotStart.getDay();
        if (day === 0 || day === 6) continue;

        // Skip outside working hours (9-18)
        const hour = slotStart.getHours();
        if (hour < 9 || hour >= 18) continue;

        // Check if all attendees are free
        let allFree = true;
        for (const email of attendeeEmails) {
          const calData = freeBusy.calendars[email];
          if (calData?.busy) {
            for (const busy of calData.busy) {
              const busyStart = new Date(busy.start).getTime();
              const busyEnd = new Date(busy.end).getTime();
              if (t < busyEnd && t + slotSize > busyStart) {
                allFree = false;
                break;
              }
            }
          }
          if (!allFree) break;
        }

        if (allFree) {
          // Score: prefer working hours center, prefer morning
          let score = 100;
          if (hour >= 10 && hour <= 14) score += 20; // prefer mid-morning to early afternoon
          if (hour >= 15) score -= 10; // slight penalty for late afternoon

          suggestions.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            score,
          });
        }
      }

      // Sort by score descending, limit to top 10
      suggestions.sort((a, b) => b.score - a.score);
      res.json({ suggestions: suggestions.slice(0, 10) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Parse Event ───────────────────────────────────────────

  app.post('/api/parse-event', (req, res) => {
    try {
      const { text } = parseEventSchema.parse(req.body);
      const result = parseNaturalLanguage(text);
      if (!result) {
        return res.status(400).json({ error: 'Could not parse event from text' });
      }
      res.json(result);
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: e.errors });
      }
      res.status(500).json({ error: e.message });
    }
  });

  // ── Health ─────────────────────────────────────────────────

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'dagaz' });
  });

  // ── Start Server ──────────────────────────────────────────

  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`Dagaz API running on http://localhost:${port}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Dagaz] Port ${port} in use, trying ${port + 1}...`);
      server.close();
      app.listen(port + 1, '127.0.0.1', () => {
        console.log(`Dagaz API running on http://localhost:${port + 1}`);
      });
    }
  });

  return server;
}
