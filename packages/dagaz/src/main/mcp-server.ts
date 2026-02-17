#!/usr/bin/env node
/**
 * Dagaz MCP Server
 *
 * A Model Context Protocol server that exposes Dagaz calendar capabilities
 * to Claude Desktop and other MCP-compatible clients.
 *
 * Architecture: Runs as a standalone stdio process spawned by Claude Desktop.
 * Proxies requests to the Dagaz API server running inside the Electron app.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = `http://localhost:${process.env.DAGAZ_API_PORT || 3143}`;

// ── HTTP helper ─────────────────────────────────────────────

async function api(path: string, options?: RequestInit): Promise<any> {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Dagaz API error ${res.status}: ${text}`);
    }
    return res.json();
  } catch (e: any) {
    if (e.cause?.code === 'ECONNREFUSED') {
      throw new Error('Dagaz is not running. Please open the Dagaz app first.');
    }
    throw e;
  }
}

// ── MCP Server ──────────────────────────────────────────────

const server = new McpServer({
  name: 'dagaz',
  version: '1.0.0',
});

// ── Tools: Calendar Read ────────────────────────────────────

server.tool(
  'list_calendars',
  'List all calendars with visibility and color info',
  {},
  async () => {
    const data = await api('/api/calendars');
    return { content: [{ type: 'text', text: JSON.stringify(data.calendars, null, 2) }] };
  }
);

server.tool(
  'get_events',
  'Get events in a date range. Returns events from all visible calendars unless filtered.',
  {
    start: z.string().describe('ISO date/datetime (e.g. "2026-02-16" or "2026-02-16T09:00:00")'),
    end: z.string().describe('ISO date/datetime'),
    calendar_id: z.string().optional().describe('Filter to a specific calendar ID'),
  },
  async ({ start, end, calendar_id }) => {
    let url = `/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    if (calendar_id) url += `&calendar=${encodeURIComponent(calendar_id)}`;
    const data = await api(url);
    return { content: [{ type: 'text', text: JSON.stringify(data.events, null, 2) }] };
  }
);

server.tool(
  'get_event',
  'Get full event details including attendees, conferencing, and description',
  { event_id: z.string().describe('Event ID') },
  async ({ event_id }) => {
    const data = await api(`/api/events/${encodeURIComponent(event_id)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'get_today',
  "Get today's events in chronological order",
  {},
  async () => {
    const data = await api('/api/today');
    return { content: [{ type: 'text', text: JSON.stringify(data.events, null, 2) }] };
  }
);

server.tool(
  'get_agenda',
  'Get agenda for a date range. Defaults to next 7 days from today.',
  {
    date: z.string().optional().describe('Start date (YYYY-MM-DD), defaults to today'),
    days: z.number().optional().describe('Number of days, defaults to 7'),
  },
  async ({ date, days }) => {
    let url = '/api/agenda';
    const params: string[] = [];
    if (date) params.push(`date=${encodeURIComponent(date)}`);
    if (days) params.push(`days=${days}`);
    if (params.length) url += '?' + params.join('&');
    const data = await api(url);
    return { content: [{ type: 'text', text: JSON.stringify(data.events, null, 2) }] };
  }
);

server.tool(
  'find_free_time',
  'Find free time slots across calendars in a date range',
  {
    calendar_ids: z.array(z.string()).describe('Calendar IDs or email addresses to check'),
    start: z.string().describe('Search range start (ISO datetime)'),
    end: z.string().describe('Search range end (ISO datetime)'),
  },
  async ({ calendar_ids, start, end }) => {
    const calendars = calendar_ids.join(',');
    const data = await api(`/api/freebusy?calendars=${encodeURIComponent(calendars)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tools: Calendar Write ───────────────────────────────────

server.tool(
  'create_event',
  'Create a new calendar event. Supports natural language input via the text field, or structured fields.',
  {
    text: z.string().optional().describe('Natural language: "Lunch with bob@co.com tomorrow at noon for 1hr at Zocalo"'),
    summary: z.string().optional().describe('Event title (if not using text)'),
    start: z.string().optional().describe('Start time ISO datetime (if not using text)'),
    end: z.string().optional().describe('End time ISO datetime (if not using text)'),
    location: z.string().optional(),
    description: z.string().optional(),
    attendees: z.array(z.string()).optional().describe('Email addresses'),
    calendar_id: z.string().optional().describe('Calendar ID, defaults to primary'),
    add_conferencing: z.boolean().optional().describe('Add Google Meet or default conferencing'),
  },
  async (args) => {
    let eventData: any;

    if (args.text) {
      // Parse natural language first
      const parsed = await api('/api/parse-event', {
        method: 'POST',
        body: JSON.stringify({ text: args.text }),
      });
      eventData = {
        ...parsed,
        ...(args.location && { location: args.location }),
        ...(args.description && { description: args.description }),
        ...(args.calendar_id && { calendar_id: args.calendar_id }),
        ...(args.add_conferencing && { add_conferencing: args.add_conferencing }),
      };
      if (args.attendees) {
        eventData.attendees = [...(parsed.attendees || []), ...args.attendees];
      }
    } else {
      if (!args.summary || !args.start || !args.end) {
        return { content: [{ type: 'text', text: 'Error: Either text or summary+start+end is required' }] };
      }
      eventData = {
        summary: args.summary,
        start: args.start,
        end: args.end,
        location: args.location,
        description: args.description,
        attendees: args.attendees,
        calendar_id: args.calendar_id,
        add_conferencing: args.add_conferencing,
      };
    }

    const data = await api('/api/events', {
      method: 'POST',
      body: JSON.stringify(eventData),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'update_event',
  'Update an existing event. Only pass the fields you want to change.',
  {
    event_id: z.string().describe('Event ID'),
    summary: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    attendees: z.array(z.string()).optional().describe('Email addresses'),
  },
  async ({ event_id, ...updates }) => {
    const data = await api(`/api/events/${encodeURIComponent(event_id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'delete_event',
  'Delete a calendar event',
  { event_id: z.string().describe('Event ID') },
  async ({ event_id }) => {
    const data = await api(`/api/events/${encodeURIComponent(event_id)}`, {
      method: 'DELETE',
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'rsvp_event',
  'RSVP to a calendar event',
  {
    event_id: z.string().describe('Event ID'),
    response: z.enum(['accepted', 'declined', 'tentative']),
  },
  async ({ event_id, response }) => {
    const data = await api(`/api/events/${encodeURIComponent(event_id)}/rsvp`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tools: Integration (Phase 2) ────────────────────────────

server.tool(
  'get_day_plan',
  'Get combined events and tasks for a date. Pulls events from Dagaz cache and tasks from Raidō.',
  {
    date: z.string().optional().describe('ISO date (YYYY-MM-DD), defaults to today'),
  },
  async ({ date }) => {
    let url = '/api/day-plan';
    if (date) url += `?date=${encodeURIComponent(date)}`;
    const data = await api(url);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'get_event_context',
  'Get rich context for an event: attendee details, recent email threads (from Kenaz), CRM data (from HubSpot). Perfect for meeting prep.',
  {
    event_id: z.string().describe('Event ID'),
  },
  async ({ event_id }) => {
    const data = await api(`/api/events/${encodeURIComponent(event_id)}/context`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'get_meeting_prep',
  'Get comprehensive meeting prep for an event: attendee profiles (HubSpot), recent email history (Kenaz), related tasks (Raidō). Returns a structured briefing.',
  {
    event_id: z.string().describe('Event ID'),
  },
  async ({ event_id }) => {
    // This combines event context with Raidō task search
    const contextData = await api(`/api/events/${encodeURIComponent(event_id)}/context`);

    // Search Raidō for related tasks
    let relatedTasks: any[] = [];
    try {
      const event = contextData.event;
      if (event?.summary) {
        const raidoRes = await fetch(`http://localhost:3142/api/search?q=${encodeURIComponent(event.summary)}`, {
          signal: AbortSignal.timeout(3000),
        });
        if (raidoRes.ok) {
          const data = await raidoRes.json();
          relatedTasks = (data.tasks || []).slice(0, 5);
        }
      }
    } catch {
      // Raidō not available
    }

    const briefing = {
      event: contextData.event,
      attendeeContext: contextData.emailThreads || [],
      hubspotContacts: contextData.hubspotContacts || [],
      relatedTasks,
    };

    return { content: [{ type: 'text', text: JSON.stringify(briefing, null, 2) }] };
  }
);

// ── Tools: Analytics & Smart Features (Phase 3) ─────────────

server.tool(
  'get_time_analytics',
  'Analyze how time was spent in a date range. Groups by category, calendar, attendee, or day of week.',
  {
    start: z.string().describe('Start date (ISO)'),
    end: z.string().describe('End date (ISO)'),
    group_by: z.enum(['category', 'calendar', 'attendee', 'day']).optional().describe('How to group the analysis'),
  },
  async ({ start, end, group_by }) => {
    let url = `/api/analytics?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    if (group_by) url += `&group_by=${group_by}`;
    const data = await api(url);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'find_meeting_time',
  'Find available meeting times across multiple people. Returns ranked suggestions.',
  {
    attendees: z.array(z.string()).describe('Email addresses of attendees'),
    duration_minutes: z.number().describe('Meeting length in minutes'),
    start: z.string().describe('Search range start (ISO datetime)'),
    end: z.string().describe('Search range end (ISO datetime)'),
  },
  async ({ attendees, duration_minutes, start, end }) => {
    const url = `/api/find-meeting-time?attendees=${encodeURIComponent(attendees.join(','))}&duration_minutes=${duration_minutes}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    const data = await api(url);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tools: Utility ──────────────────────────────────────────

server.tool(
  'parse_event_text',
  'Parse natural language into structured event fields without creating the event. Useful for confirming before creating.',
  { text: z.string().describe('Natural language event description') },
  async ({ text }) => {
    const data = await api('/api/parse-event', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'get_sync_status',
  'Get sync status: last sync time, pending offline changes, connection state',
  {},
  async () => {
    const data = await api('/api/sync/status');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Start Server ────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Dagaz MCP server running on stdio');
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
