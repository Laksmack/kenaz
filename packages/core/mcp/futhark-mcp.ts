#!/usr/bin/env node
/**
 * Futhark Unified MCP Server
 *
 * A single Model Context Protocol server exposing tools from all Futhark apps:
 *   - Kenaz (email, CRM)      — port 3141
 *   - Raidō  (tasks)           — port 3142
 *   - Dagaz  (calendar)        — port 3143
 *   - Laguz  (notes/vault)     — port 3144
 *
 * Architecture: Standalone stdio process spawned by Claude Desktop.
 * Proxies requests to each app's local API server over HTTP.
 * Tools are namespaced with underscore prefixes: kenaz_*, raido_*, dagaz_*, laguz_*.
 *
 * Install location: ~/.futhark/mcp-server.js
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { homedir } from 'os';
import { join, extname, basename } from 'path';
import { writeFileSync, existsSync, readFileSync, statSync } from 'fs';

// ── App Registry ────────────────────────────────────────────

const APPS = {
  kenaz: { port: 3141, envVar: 'KENAZ_API_PORT', name: 'Kenaz', desc: 'email & CRM' },
  raido: { port: 3142, envVar: 'RAIDO_API_PORT', name: 'Raidō', desc: 'tasks' },
  dagaz: { port: 3143, envVar: 'DAGAZ_API_PORT', name: 'Dagaz', desc: 'calendar' },
  laguz: { port: 3144, envVar: 'LAGUZ_API_PORT', name: 'Laguz', desc: 'notes & vault' },
} as const;

type AppName = keyof typeof APPS;

function portFor(app: AppName): number {
  return parseInt(process.env[APPS[app].envVar] || '', 10) || APPS[app].port;
}

function baseUrl(app: AppName): string {
  return `http://localhost:${portFor(app)}`;
}

async function api(app: AppName, path: string, options?: RequestInit): Promise<any> {
  const url = `${baseUrl(app)}${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${APPS[app].name} API error ${res.status}: ${text}`);
    }
    return res.json();
  } catch (e: any) {
    if (e.cause?.code === 'ECONNREFUSED') {
      throw new Error(`${APPS[app].name} is not running. Please open the ${APPS[app].name} app first.`);
    }
    throw e;
  }
}

async function isReachable(app: AppName): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl(app)}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ── File Attachment Helper (Kenaz) ──────────────────────────

const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', zip: 'application/zip',
  txt: 'text/plain', csv: 'text/csv', html: 'text/html', json: 'application/json',
  mp4: 'video/mp4', mp3: 'audio/mpeg',
};

function readFileAsAttachment(filePath: string): { filename: string; mimeType: string; base64: string; size: number } {
  const resolved = filePath.startsWith('~') ? join(homedir(), filePath.slice(1)) : filePath;
  if (!existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
  const stat = statSync(resolved);
  if (stat.size > 25 * 1024 * 1024) throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)} MB). Gmail limit is 25 MB.`);
  const data = readFileSync(resolved);
  const ext = extname(resolved).toLowerCase().slice(1);
  return {
    filename: basename(resolved),
    mimeType: MIME_TYPES[ext] || 'application/octet-stream',
    base64: data.toString('base64'),
    size: data.length,
  };
}

// ── MCP Server ──────────────────────────────────────────────

const server = new McpServer({
  name: 'futhark',
  version: '1.0.1',
});

// ═══════════════════════════════════════════════════════════
// META TOOLS
// ═══════════════════════════════════════════════════════════

server.tool(
  'futhark_status',
  'Check which Futhark apps are currently running. Returns reachability status for Kenaz (email), Raidō (tasks), Dagaz (calendar), and Laguz (notes).',
  {},
  async () => {
    const results = await Promise.all(
      (Object.keys(APPS) as AppName[]).map(async (app) => ({
        app: APPS[app].name,
        description: APPS[app].desc,
        port: portFor(app),
        running: await isReachable(app),
      }))
    );
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  }
);

// ═══════════════════════════════════════════════════════════
// KENAZ — Email, CRM, Calendar (port 3141)
// ═══════════════════════════════════════════════════════════

// ── Read ──

server.tool(
  'kenaz_get_inbox',
  'Get the most recent inbox threads (up to 50)',
  {},
  async () => {
    const data = await api('kenaz', '/api/inbox');
    return { content: [{ type: 'text', text: JSON.stringify(data.threads, null, 2) }] };
  }
);

server.tool(
  'kenaz_get_unread',
  'Get unread inbox threads with count',
  {},
  async () => {
    const data = await api('kenaz', '/api/unread');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'kenaz_get_stats',
  'Get inbox statistics: counts for inbox, unread, starred, pending, todo, drafts',
  {},
  async () => {
    const data = await api('kenaz', '/api/stats');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'kenaz_search_emails',
  'Search emails using Gmail query syntax (e.g. "from:user@example.com", "subject:invoice", "is:unread", "after:2026/01/01"). Returns up to 50 matching threads.',
  { query: z.string().describe('Gmail search query') },
  async ({ query }) => {
    const data = await api('kenaz', `/api/search?q=${encodeURIComponent(query)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.threads, null, 2) }] };
  }
);

server.tool(
  'kenaz_get_thread',
  'Get a full email thread with all messages, bodies, and attachment metadata',
  { thread_id: z.string().describe('Gmail thread ID') },
  async ({ thread_id }) => {
    const data = await api('kenaz', `/api/email/${thread_id}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'kenaz_get_thread_summary',
  'Get an AI-ready thread summary: participants, timeline, latest message body. Ideal for understanding context before drafting a reply.',
  { thread_id: z.string().describe('Gmail thread ID') },
  async ({ thread_id }) => {
    const data = await api('kenaz', `/api/thread/${thread_id}/summary`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Attachments ──

server.tool(
  'kenaz_list_thread_attachments',
  'List all attachments in an email thread. Returns attachment metadata (id, filename, mimeType, size) for each message.',
  { thread_id: z.string().describe('Gmail thread ID') },
  async ({ thread_id }) => {
    const data = await api('kenaz', `/api/thread/${thread_id}/attachments`);
    return { content: [{ type: 'text', text: JSON.stringify(data.attachments, null, 2) }] };
  }
);

server.tool(
  'kenaz_download_attachment',
  "Download a specific attachment to the user's Downloads folder. Returns the file path.",
  {
    message_id: z.string().describe('Gmail message ID containing the attachment'),
    attachment_id: z.string().describe('Attachment ID from list_thread_attachments'),
    filename: z.string().describe('Original filename for the saved file'),
  },
  async ({ message_id, attachment_id, filename }) => {
    const data = await api('kenaz', `/api/attachment/${message_id}/${attachment_id}/download?filename=${encodeURIComponent(filename)}`, {
      method: 'POST',
    });
    return { content: [{ type: 'text', text: `Downloaded to: ${data.path}` }] };
  }
);

server.tool(
  'kenaz_download_all_thread_attachments',
  "Download all attachments from a thread as a zip file to the user's Downloads folder.",
  { thread_id: z.string().describe('Gmail thread ID') },
  async ({ thread_id }) => {
    const listData = await api('kenaz', `/api/thread/${thread_id}/attachments`);
    const attachments = listData.attachments || [];
    if (attachments.length === 0) {
      return { content: [{ type: 'text', text: 'No attachments found in this thread.' }] };
    }

    const url = `${baseUrl('kenaz')}/api/thread/${thread_id}/attachments/download-all`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to download: ${text}`);
    }

    const downloadsDir = join(homedir(), 'Downloads');
    let filePath = join(downloadsDir, `attachments-${thread_id}.zip`);
    let counter = 1;
    while (existsSync(filePath)) {
      filePath = join(downloadsDir, `attachments-${thread_id} (${counter}).zip`);
      counter++;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(filePath, buffer);

    const fileList = attachments.map((a: any) => `  - ${a.filename} (${(a.size / 1024).toFixed(1)} KB)`).join('\n');
    return { content: [{ type: 'text', text: `Downloaded ${attachments.length} attachments to:\n${filePath}\n\nFiles:\n${fileList}` }] };
  }
);

// ── Email Write ──

server.tool(
  'kenaz_draft_email',
  'Create an email draft in Kenaz for review before sending. Supports markdown body (auto-converted to HTML). Use reply_to_thread_id to make it a reply. Supports file attachments via absolute file paths.',
  {
    to: z.string().describe('Comma-separated recipient emails'),
    subject: z.string().describe('Email subject'),
    body_markdown: z.string().describe('Email body in markdown (converted to HTML)'),
    cc: z.string().optional().describe('Comma-separated CC emails'),
    bcc: z.string().optional().describe('Comma-separated BCC emails'),
    reply_to_thread_id: z.string().optional().describe('Thread ID to reply to (makes this a reply)'),
    reply_to_message_id: z.string().optional().describe('Message ID for In-Reply-To header'),
    attachment_paths: z.array(z.string()).optional().describe('Array of absolute file paths to attach'),
  },
  async (params) => {
    const { attachment_paths, ...emailParams } = params;
    const payload: any = { ...emailParams };

    if (attachment_paths && attachment_paths.length > 0) {
      payload.attachments = attachment_paths.map(readFileAsAttachment);
    }

    const data = await api('kenaz', '/api/draft', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const attInfo = payload.attachments
      ? `\nAttachments: ${payload.attachments.map((a: any) => `${a.filename} (${(a.size / 1024).toFixed(1)} KB)`).join(', ')}`
      : '';
    return { content: [{ type: 'text', text: `Draft created: ${data.draftId}${attInfo}` }] };
  }
);

server.tool(
  'kenaz_send_email',
  'Send an email immediately. Use draft_email instead if the user should review first. Supports markdown body and file attachments.',
  {
    to: z.string().describe('Comma-separated recipient emails'),
    subject: z.string().describe('Email subject'),
    body_markdown: z.string().describe('Email body in markdown (converted to HTML)'),
    cc: z.string().optional().describe('Comma-separated CC emails'),
    bcc: z.string().optional().describe('Comma-separated BCC emails'),
    reply_to_thread_id: z.string().optional().describe('Thread ID to reply to'),
    reply_to_message_id: z.string().optional().describe('Message ID for In-Reply-To header'),
    attachment_paths: z.array(z.string()).optional().describe('Array of absolute file paths to attach'),
  },
  async (params) => {
    const { attachment_paths, ...emailParams } = params;
    const payload: any = { ...emailParams };

    if (attachment_paths && attachment_paths.length > 0) {
      payload.attachments = attachment_paths.map(readFileAsAttachment);
    }

    const data = await api('kenaz', '/api/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const attInfo = payload.attachments
      ? `\nAttachments: ${payload.attachments.map((a: any) => `${a.filename} (${(a.size / 1024).toFixed(1)} KB)`).join(', ')}`
      : '';
    return { content: [{ type: 'text', text: `Email sent. Message ID: ${data.id}, Thread ID: ${data.threadId}${attInfo}` }] };
  }
);

// ── Drafts ──

server.tool(
  'kenaz_list_drafts',
  'List all email drafts',
  {},
  async () => {
    const data = await api('kenaz', '/api/drafts');
    return { content: [{ type: 'text', text: JSON.stringify(data.drafts, null, 2) }] };
  }
);

server.tool(
  'kenaz_get_draft',
  'Get a draft with full body content',
  { draft_id: z.string().describe('Draft ID') },
  async ({ draft_id }) => {
    const data = await api('kenaz', `/api/draft/${draft_id}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'kenaz_delete_draft',
  'Delete a draft',
  { draft_id: z.string().describe('Draft ID') },
  async ({ draft_id }) => {
    await api('kenaz', `/api/draft/${draft_id}`, { method: 'DELETE' });
    return { content: [{ type: 'text', text: 'Draft deleted.' }] };
  }
);

// ── Email Actions ──

server.tool(
  'kenaz_archive_thread',
  'Archive an email thread (remove from inbox)',
  { thread_id: z.string().describe('Thread ID to archive') },
  async ({ thread_id }) => {
    await api('kenaz', `/api/archive/${thread_id}`, { method: 'POST' });
    return { content: [{ type: 'text', text: `Thread ${thread_id} archived.` }] };
  }
);

server.tool(
  'kenaz_trash_thread',
  'Move an email thread to trash',
  { thread_id: z.string().describe('Thread ID to trash') },
  async ({ thread_id }) => {
    await api('kenaz', `/api/thread/${thread_id}`, { method: 'DELETE' });
    return { content: [{ type: 'text', text: `Thread ${thread_id} trashed.` }] };
  }
);

server.tool(
  'kenaz_modify_labels',
  'Add or remove labels from an email thread. Common labels: INBOX, STARRED, UNREAD, IMPORTANT.',
  {
    thread_id: z.string().describe('Thread ID'),
    add: z.string().optional().describe('Label name to add'),
    remove: z.string().optional().describe('Label name to remove'),
  },
  async ({ thread_id, add, remove }) => {
    await api('kenaz', `/api/label/${thread_id}`, {
      method: 'POST',
      body: JSON.stringify({ add: add || null, remove: remove || null }),
    });
    return { content: [{ type: 'text', text: `Labels updated on thread ${thread_id}.` }] };
  }
);

server.tool(
  'kenaz_batch_archive',
  'Archive multiple email threads at once',
  { thread_ids: z.array(z.string()).describe('Array of thread IDs to archive') },
  async ({ thread_ids }) => {
    const data = await api('kenaz', '/api/batch/archive', {
      method: 'POST',
      body: JSON.stringify({ threadIds: thread_ids }),
    });
    return { content: [{ type: 'text', text: `Archived ${data.archived} threads.` }] };
  }
);

server.tool(
  'kenaz_list_labels',
  'List all available Gmail labels (system + custom)',
  {},
  async () => {
    const data = await api('kenaz', '/api/labels');
    return { content: [{ type: 'text', text: JSON.stringify(data.labels, null, 2) }] };
  }
);

// ── HubSpot CRM ──

server.tool(
  'kenaz_hubspot_lookup',
  'Look up a HubSpot contact by email. Returns contact info, associated deals, and recent activities.',
  { email: z.string().describe('Contact email address') },
  async ({ email }) => {
    const data = await api('kenaz', `/api/hubspot/contact/${encodeURIComponent(email)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'kenaz_hubspot_deals',
  'List active HubSpot deals. Optionally filter by stage or owner.',
  {
    stage: z.string().optional().describe('Filter by deal stage'),
    owner: z.string().optional().describe('Filter by owner ID'),
  },
  async ({ stage, owner }) => {
    const params = new URLSearchParams();
    if (stage) params.set('stage', stage);
    if (owner) params.set('owner', owner);
    const qs = params.toString();
    const data = await api('kenaz', `/api/hubspot/deals${qs ? '?' + qs : ''}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.deals, null, 2) }] };
  }
);

server.tool(
  'kenaz_hubspot_recent_activities',
  'Get recent HubSpot activities (emails, notes, meetings, calls) for a contact',
  {
    email: z.string().describe('Contact email address'),
    limit: z.number().optional().describe('Max results (default 10)'),
  },
  async ({ email, limit }) => {
    const qs = limit ? `?limit=${limit}` : '';
    const data = await api('kenaz', `/api/hubspot/recent/${encodeURIComponent(email)}${qs}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Combined Context ──

server.tool(
  'kenaz_get_contact_context',
  'Get full context for a contact: HubSpot info + deals + recent activities + last 5 email threads. Ideal before drafting an email.',
  { email: z.string().describe('Contact email address') },
  async ({ email }) => {
    const data = await api('kenaz', `/api/context/${encodeURIComponent(email)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Contacts ──

server.tool(
  'kenaz_suggest_contacts',
  'Autocomplete contact suggestions based on a prefix. Searches names and emails, ranked by frequency.',
  {
    prefix: z.string().describe('Search prefix (name or email)'),
    limit: z.number().optional().describe('Max results (default 8)'),
  },
  async ({ prefix, limit }) => {
    const data = await api('kenaz', `/api/search?q=from:${encodeURIComponent(prefix)}+OR+to:${encodeURIComponent(prefix)}`);
    const contacts = new Map<string, { email: string; name: string }>();
    for (const thread of (data.threads || []).slice(0, limit || 8)) {
      if (thread.from?.email) contacts.set(thread.from.email, thread.from);
      for (const p of thread.participants || []) {
        if (p.email) contacts.set(p.email, p);
      }
    }
    return { content: [{ type: 'text', text: JSON.stringify(Array.from(contacts.values()), null, 2) }] };
  }
);

// ── Calendar (via Kenaz) ──

server.tool(
  'kenaz_calendar_events',
  'List calendar events in a time range (via Kenaz). Defaults to today.',
  {
    time_min: z.string().optional().describe('Start time (ISO format). Defaults to now.'),
    time_max: z.string().optional().describe('End time (ISO format). Defaults to end of today.'),
  },
  async ({ time_min, time_max }) => {
    const params = new URLSearchParams();
    if (time_min) params.set('timeMin', time_min);
    if (time_max) params.set('timeMax', time_max);
    const qs = params.toString();
    const data = await api('kenaz', `/api/calendar/events${qs ? '?' + qs : ''}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.events, null, 2) }] };
  }
);

server.tool(
  'kenaz_calendar_rsvp',
  'RSVP to a calendar event (via Kenaz)',
  {
    event_id: z.string().describe('Calendar event ID (local UUID or Google Calendar ID)'),
    response: z.enum(['accepted', 'tentative', 'declined']).describe('RSVP response'),
  },
  async ({ event_id, response }) => {
    const data = await api('kenaz', `/api/calendar/rsvp/${event_id}`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Views & Rules ──

server.tool(
  'kenaz_list_views',
  'List all email views (sidebar items with Gmail queries)',
  {},
  async () => {
    const data = await api('kenaz', '/api/views');
    return { content: [{ type: 'text', text: JSON.stringify(data.views, null, 2) }] };
  }
);

server.tool(
  'kenaz_list_rules',
  'List all automation rules',
  {},
  async () => {
    const data = await api('kenaz', '/api/rules');
    return { content: [{ type: 'text', text: JSON.stringify(data.rules, null, 2) }] };
  }
);

// ═══════════════════════════════════════════════════════════
// DAGAZ — Calendar (port 3143)
// ═══════════════════════════════════════════════════════════

// ── Read ──

server.tool(
  'dagaz_list_calendars',
  'List all calendars with visibility and color info',
  {},
  async () => {
    const data = await api('dagaz', '/api/calendars');
    return { content: [{ type: 'text', text: JSON.stringify(data.calendars, null, 2) }] };
  }
);

server.tool(
  'dagaz_get_events',
  'Get events in a date range. Returns events from all visible calendars unless filtered.',
  {
    start: z.string().describe('ISO date/datetime (e.g. "2026-02-16" or "2026-02-16T09:00:00")'),
    end: z.string().describe('ISO date/datetime'),
    calendar_id: z.string().optional().describe('Filter to a specific calendar ID'),
  },
  async ({ start, end, calendar_id }) => {
    let url = `/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    if (calendar_id) url += `&calendar=${encodeURIComponent(calendar_id)}`;
    const data = await api('dagaz', url);
    return { content: [{ type: 'text', text: JSON.stringify(data.events, null, 2) }] };
  }
);

server.tool(
  'dagaz_get_event',
  'Get full event details including attendees, conferencing, and description',
  { event_id: z.string().describe('Event ID (local UUID or Google Calendar ID — either works)') },
  async ({ event_id }) => {
    const data = await api('dagaz', `/api/events/${encodeURIComponent(event_id)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'dagaz_get_today',
  "Get today's events in chronological order",
  {},
  async () => {
    const data = await api('dagaz', '/api/today');
    return { content: [{ type: 'text', text: JSON.stringify(data.events, null, 2) }] };
  }
);

server.tool(
  'dagaz_get_agenda',
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
    const data = await api('dagaz', url);
    return { content: [{ type: 'text', text: JSON.stringify(data.events, null, 2) }] };
  }
);

server.tool(
  'dagaz_find_free_time',
  'Find free time slots across calendars in a date range',
  {
    calendar_ids: z.array(z.string()).describe('Calendar IDs or email addresses to check'),
    start: z.string().describe('Search range start (ISO datetime)'),
    end: z.string().describe('Search range end (ISO datetime)'),
  },
  async ({ calendar_ids, start, end }) => {
    const calendars = calendar_ids.join(',');
    const data = await api('dagaz', `/api/freebusy?calendars=${encodeURIComponent(calendars)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Write ──

server.tool(
  'dagaz_create_event',
  'Create a new calendar event. Supports natural language input via the text field, or structured fields. For all-day events use date-only strings (YYYY-MM-DD) and set all_day=true.',
  {
    text: z.string().optional().describe('Natural language: "Lunch with bob@co.com tomorrow at noon for 1hr at Zocalo"'),
    summary: z.string().optional().describe('Event title (if not using text)'),
    start: z.string().optional().describe('Start: ISO datetime or date-only for all-day events'),
    end: z.string().optional().describe('End: ISO datetime or date-only'),
    all_day: z.boolean().optional().describe('True for all-day events'),
    location: z.string().optional(),
    description: z.string().optional(),
    attendees: z.array(z.string()).optional().describe('Email addresses'),
    calendar_id: z.string().optional().describe('Calendar ID, defaults to primary'),
    add_conferencing: z.boolean().optional().describe('Add Google Meet or default conferencing'),
    transparency: z.enum(['opaque', 'transparent']).optional().describe('"opaque" = busy (default), "transparent" = free/available'),
    visibility: z.enum(['default', 'public', 'private', 'confidential']).optional(),
    recurrence: z.array(z.string()).optional().describe('RRULE strings, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO"]'),
  },
  async (args) => {
    let eventData: any;

    if (args.text) {
      const parsed = await api('dagaz', '/api/parse-event', {
        method: 'POST',
        body: JSON.stringify({ text: args.text }),
      });
      eventData = {
        ...parsed,
        ...(args.location && { location: args.location }),
        ...(args.description && { description: args.description }),
        ...(args.calendar_id && { calendar_id: args.calendar_id }),
        ...(args.add_conferencing && { add_conferencing: args.add_conferencing }),
        ...(args.transparency && { transparency: args.transparency }),
        ...(args.visibility && { visibility: args.visibility }),
        ...(args.all_day !== undefined && { all_day: args.all_day }),
        ...(args.recurrence && { recurrence: args.recurrence }),
      };
      if (args.attendees) {
        eventData.attendees = [...(parsed.attendees || []), ...args.attendees];
      }
    } else {
      if (!args.summary || !args.start || !args.end) {
        return { content: [{ type: 'text', text: 'Error: Either text or summary+start+end is required' }] };
      }
      const isAllDay = args.all_day ?? (/^\d{4}-\d{2}-\d{2}$/.test(args.start) && /^\d{4}-\d{2}-\d{2}$/.test(args.end));
      eventData = {
        summary: args.summary, start: args.start, end: args.end, all_day: isAllDay,
        location: args.location, description: args.description, attendees: args.attendees,
        calendar_id: args.calendar_id, add_conferencing: args.add_conferencing,
        transparency: args.transparency, visibility: args.visibility, recurrence: args.recurrence,
      };
    }

    const data = await api('dagaz', '/api/events', {
      method: 'POST',
      body: JSON.stringify(eventData),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'dagaz_update_event',
  'Update an existing event. Only pass fields you want to change.',
  {
    event_id: z.string().describe('Event ID (local UUID or Google Calendar ID)'),
    summary: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    all_day: z.boolean().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    attendees: z.array(z.string()).optional().describe('Email addresses (replaces existing)'),
    transparency: z.enum(['opaque', 'transparent']).optional(),
    visibility: z.enum(['default', 'public', 'private', 'confidential']).optional(),
  },
  async ({ event_id, ...updates }) => {
    const data = await api('dagaz', `/api/events/${encodeURIComponent(event_id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'dagaz_reschedule_event',
  'Reschedule an event to a new time. Automatically notifies attendees.',
  {
    event_id: z.string().describe('Event ID (local UUID or Google Calendar ID)'),
    new_start: z.string().describe('New start time (ISO datetime)'),
    new_end: z.string().describe('New end time (ISO datetime)'),
    note: z.string().optional().describe('Optional note to attendees about why'),
  },
  async ({ event_id, new_start, new_end, note }) => {
    const existing = await api('dagaz', `/api/events/${encodeURIComponent(event_id)}`);
    const updates: any = { start: new_start, end: new_end };
    if (note) {
      const timestamp = new Date().toLocaleString();
      updates.description = (existing.description || '') + `\n\n---\nRescheduled on ${timestamp}: ${note}`;
    }
    if (existing.attendees?.length > 0) {
      updates.attendees = existing.attendees.map((a: any) => a.email);
    }
    const data = await api('dagaz', `/api/events/${encodeURIComponent(event_id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'dagaz_bulk_create_events',
  'Create multiple events in one call. Returns all created events.',
  {
    events: z.array(z.object({
      summary: z.string(),
      start: z.string(),
      end: z.string(),
      all_day: z.boolean().optional(),
      location: z.string().optional(),
      description: z.string().optional(),
      attendees: z.array(z.string()).optional(),
      calendar_id: z.string().optional(),
      add_conferencing: z.boolean().optional(),
      transparency: z.enum(['opaque', 'transparent']).optional(),
    })).describe('Array of events to create'),
  },
  async ({ events }) => {
    const results: any[] = [];
    const errors: any[] = [];
    for (let i = 0; i < events.length; i++) {
      try {
        const evt = events[i];
        const isAllDay = evt.all_day ?? (/^\d{4}-\d{2}-\d{2}$/.test(evt.start) && /^\d{4}-\d{2}-\d{2}$/.test(evt.end));
        const data = await api('dagaz', '/api/events', {
          method: 'POST',
          body: JSON.stringify({ ...evt, all_day: isAllDay }),
        });
        results.push({ index: i, success: true, event: data });
      } catch (e: any) {
        errors.push({ index: i, success: false, error: e.message, summary: events[i].summary });
      }
    }
    const summary = `Created ${results.length}/${events.length} events` +
      (errors.length > 0 ? ` (${errors.length} failed)` : '');
    return { content: [{ type: 'text', text: JSON.stringify({ summary, results, errors }, null, 2) }] };
  }
);

server.tool(
  'dagaz_delete_event',
  'Delete a calendar event',
  { event_id: z.string().describe('Event ID (local UUID or Google Calendar ID)') },
  async ({ event_id }) => {
    const data = await api('dagaz', `/api/events/${encodeURIComponent(event_id)}`, { method: 'DELETE' });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'dagaz_rsvp_event',
  'RSVP to a calendar event',
  {
    event_id: z.string().describe('Event ID (local UUID or Google Calendar ID)'),
    response: z.enum(['accepted', 'declined', 'tentative']),
  },
  async ({ event_id, response }) => {
    const data = await api('dagaz', `/api/events/${encodeURIComponent(event_id)}/rsvp`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Integration ──

server.tool(
  'dagaz_get_day_plan',
  'Get combined events and tasks for a date. Pulls events from Dagaz and tasks from Raidō.',
  {
    date: z.string().optional().describe('ISO date (YYYY-MM-DD), defaults to today'),
  },
  async ({ date }) => {
    let url = '/api/day-plan';
    if (date) url += `?date=${encodeURIComponent(date)}`;
    const data = await api('dagaz', url);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'dagaz_get_event_context',
  'Get rich context for an event: attendee details, recent email threads (from Kenaz), CRM data (from HubSpot). Perfect for meeting prep.',
  { event_id: z.string().describe('Event ID (local UUID or Google Calendar ID — either works)') },
  async ({ event_id }) => {
    const data = await api('dagaz', `/api/events/${encodeURIComponent(event_id)}/context`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'dagaz_get_meeting_prep',
  'Comprehensive meeting prep: attendee profiles (HubSpot), email history (Kenaz), related tasks (Raidō). Returns a structured briefing.',
  { event_id: z.string().describe('Event ID (local UUID or Google Calendar ID — either works)') },
  async ({ event_id }) => {
    const contextData = await api('dagaz', `/api/events/${encodeURIComponent(event_id)}/context`);
    let relatedTasks: any[] = [];
    try {
      const event = contextData.event;
      if (event?.summary) {
        const raidoRes = await fetch(`${baseUrl('raido')}/api/search?q=${encodeURIComponent(event.summary)}`, {
          signal: AbortSignal.timeout(3000),
        });
        if (raidoRes.ok) {
          const data = await raidoRes.json();
          relatedTasks = (data.tasks || []).slice(0, 5);
        }
      }
    } catch { /* Raidō not available */ }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          event: contextData.event,
          attendeeContext: contextData.emailThreads || [],
          hubspotContacts: contextData.hubspotContacts || [],
          relatedTasks,
        }, null, 2),
      }],
    };
  }
);

// ── Analytics ──

server.tool(
  'dagaz_get_time_analytics',
  'Analyze how time was spent in a date range. Groups by category, calendar, attendee, or day of week.',
  {
    start: z.string().describe('Start date (ISO)'),
    end: z.string().describe('End date (ISO)'),
    group_by: z.enum(['category', 'calendar', 'attendee', 'day']).optional(),
  },
  async ({ start, end, group_by }) => {
    let url = `/api/analytics?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    if (group_by) url += `&group_by=${group_by}`;
    const data = await api('dagaz', url);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'dagaz_find_meeting_time',
  'Find available meeting times across multiple people. Returns ranked suggestions.',
  {
    attendees: z.array(z.string()).describe('Email addresses of attendees'),
    duration_minutes: z.number().describe('Meeting length in minutes'),
    start: z.string().describe('Search range start (ISO datetime)'),
    end: z.string().describe('Search range end (ISO datetime)'),
  },
  async ({ attendees, duration_minutes, start, end }) => {
    const url = `/api/find-meeting-time?attendees=${encodeURIComponent(attendees.join(','))}&duration_minutes=${duration_minutes}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    const data = await api('dagaz', url);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Utility ──

server.tool(
  'dagaz_parse_event_text',
  'Parse natural language into structured event fields without creating the event.',
  { text: z.string().describe('Natural language event description') },
  async ({ text }) => {
    const data = await api('dagaz', '/api/parse-event', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'dagaz_get_sync_status',
  'Get sync status: last sync time, pending offline changes, connection state',
  {},
  async () => {
    const data = await api('dagaz', '/api/sync/status');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ═══════════════════════════════════════════════════════════
// RAIDŌ — Tasks (port 3142)
// ═══════════════════════════════════════════════════════════

// ── Read ──

server.tool(
  'raido_get_today',
  "Get today's tasks plus any overdue tasks",
  {},
  async () => {
    const data = await api('raido', '/api/today');
    return { content: [{ type: 'text', text: JSON.stringify(data.tasks, null, 2) }] };
  }
);

server.tool(
  'raido_get_inbox',
  'Get unprocessed tasks (no due date)',
  {},
  async () => {
    const data = await api('raido', '/api/inbox');
    return { content: [{ type: 'text', text: JSON.stringify(data.tasks, null, 2) }] };
  }
);

server.tool(
  'raido_get_upcoming',
  'Get tasks with future due dates ordered by date',
  {},
  async () => {
    const data = await api('raido', '/api/upcoming');
    return { content: [{ type: 'text', text: JSON.stringify(data.tasks, null, 2) }] };
  }
);

server.tool(
  'raido_get_groups',
  'Get all bracket groups with open task counts. Groups are derived from [BracketPrefix] in task titles.',
  {},
  async () => {
    const data = await api('raido', '/api/groups');
    return { content: [{ type: 'text', text: JSON.stringify(data.groups, null, 2) }] };
  }
);

server.tool(
  'raido_get_group',
  'Get all open tasks in a bracket group',
  { name: z.string().describe('Group name (without brackets), e.g. "Conagra"') },
  async ({ name }) => {
    const data = await api('raido', `/api/group/${encodeURIComponent(name)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.tasks, null, 2) }] };
  }
);

// ── Write ──

server.tool(
  'raido_add_todo',
  'Create a new task. To assign to a group, include [GroupName] prefix in the title.',
  {
    title: z.string().describe('Task title. Use [GroupName] prefix for group assignment, e.g. "[Conagra] Review cameras"'),
    notes: z.string().optional().describe('Markdown notes'),
    due_date: z.string().optional().describe('Due date (YYYY-MM-DD). Tasks without a due date go to Inbox.'),
    tags: z.array(z.string()).optional().describe('Tags to apply'),
    priority: z.number().min(0).max(3).optional().describe('Priority: 0=none, 1=low, 2=medium, 3=high'),
    kenaz_thread_id: z.string().optional().describe('Linked Kenaz email thread ID'),
    hubspot_deal_id: z.string().optional().describe('Linked HubSpot deal ID'),
    vault_path: z.string().optional().describe('Linked Laguz vault path'),
  },
  async (args) => {
    const data = await api('raido', '/api/task', {
      method: 'POST',
      body: JSON.stringify(args),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'raido_update_todo',
  'Update an existing task',
  {
    id: z.string().describe('Task ID'),
    title: z.string().optional(),
    notes: z.string().optional(),
    due_date: z.string().nullable().optional().describe('Due date (YYYY-MM-DD) or null to move to Inbox'),
    completed: z.boolean().optional().describe('Mark as completed'),
    canceled: z.boolean().optional().describe('Mark as canceled'),
    priority: z.number().min(0).max(3).optional(),
    tags: z.array(z.string()).optional().describe('Replace tags'),
  },
  async ({ id, completed, canceled, ...updates }) => {
    if (completed) {
      const data = await api('raido', `/api/task/${id}/complete`, { method: 'POST' });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
    if (canceled) {
      (updates as any).status = 'canceled';
    }
    const data = await api('raido', `/api/task/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Search & Stats ──

server.tool(
  'raido_search_todos',
  'Search tasks by title or notes',
  { query: z.string().describe('Search query') },
  async ({ query }) => {
    const data = await api('raido', `/api/search?q=${encodeURIComponent(query)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.tasks, null, 2) }] };
  }
);

server.tool(
  'raido_search_advanced',
  'Advanced search with filters',
  {
    query: z.string().describe('Search text'),
    tags: z.array(z.string()).optional().describe('Filter by tags'),
    completed: z.boolean().optional().describe('Include completed tasks'),
    canceled: z.boolean().optional().describe('Include canceled tasks'),
  },
  async ({ query }) => {
    const data = await api('raido', `/api/search?q=${encodeURIComponent(query)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.tasks, null, 2) }] };
  }
);

server.tool(
  'raido_get_logbook',
  'Get recently completed tasks',
  { days: z.number().optional().default(7).describe('Number of days to look back (default: 7)') },
  async ({ days }) => {
    const data = await api('raido', `/api/logbook?days=${days}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.tasks, null, 2) }] };
  }
);

server.tool(
  'raido_get_stats',
  'Get task counts: overdue, today, inbox, total open — useful for badge count and daily briefing',
  {},
  async () => {
    const data = await api('raido', '/api/stats');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'raido_get_tags',
  'Get all tags with usage counts',
  {},
  async () => {
    const data = await api('raido', '/api/tags');
    return { content: [{ type: 'text', text: JSON.stringify(data.tags, null, 2) }] };
  }
);

server.tool(
  'raido_get_tagged_items',
  'Get all tasks with a specific tag',
  { tag_name: z.string().describe('Tag name') },
  async ({ tag_name }) => {
    const data = await api('raido', `/api/tagged/${encodeURIComponent(tag_name)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.tasks, null, 2) }] };
  }
);

// ── Attachments ──

server.tool(
  'raido_attach_file',
  'Attach a local file to an existing task. Accepts any file path on disk.',
  {
    task_id: z.string().describe('Task ID to attach the file to'),
    file_path: z.string().describe('Absolute path to the file on disk'),
  },
  async ({ task_id, file_path }) => {
    if (!existsSync(file_path)) throw new Error(`File not found: ${file_path}`);
    const stat = statSync(file_path);
    if (!stat.isFile()) throw new Error(`Not a file: ${file_path}`);
    if (stat.size > 50 * 1024 * 1024) throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)} MB). Max 50 MB.`);
    const buffer = readFileSync(file_path);
    const filename = basename(file_path);
    const data = await api('raido', `/api/task/${task_id}/attachment`, {
      method: 'POST',
      body: JSON.stringify({ filename, data: buffer.toString('base64') }),
    });
    return { content: [{ type: 'text', text: `Attached "${filename}" (${(stat.size / 1024).toFixed(1)} KB) to task ${task_id}\n${JSON.stringify(data.attachment, null, 2)}` }] };
  }
);

server.tool(
  'raido_list_attachments',
  'List all file attachments on a task',
  {
    task_id: z.string().describe('Task ID'),
  },
  async ({ task_id }) => {
    const data = await api('raido', `/api/task/${task_id}/attachments`);
    const atts = data.attachments || [];
    if (atts.length === 0) return { content: [{ type: 'text', text: 'No attachments on this task.' }] };
    return { content: [{ type: 'text', text: JSON.stringify(atts, null, 2) }] };
  }
);

// ═══════════════════════════════════════════════════════════
// LAGUZ — Notes & Vault (port 3144)
// ═══════════════════════════════════════════════════════════

server.tool(
  'laguz_search',
  'Search vault notes by content. Supports optional filters for type, company, date range, and tags.',
  {
    query: z.string().describe('Full-text search query'),
    type: z.string().optional().describe('Filter by note type: meeting, account, person, resource, personal, strategy'),
    company: z.string().optional().describe('Filter by company name'),
    since: z.string().optional().describe('Only notes on or after this date (YYYY-MM-DD)'),
    tags: z.array(z.string()).optional().describe('Filter by tags'),
  },
  async ({ query, type, company, since, tags }) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (type) params.set('type', type);
    if (company) params.set('company', company);
    if (since) params.set('since', since);
    if (tags?.length) params.set('tags', tags.join(','));
    const data = await api('laguz', `/api/search?${params}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.notes, null, 2) }] };
  }
);

server.tool(
  'laguz_get_note',
  'Get full note content by vault-relative path',
  {
    path: z.string().describe('Vault-relative path, e.g. "meetings/2026-02-13 - Tesla Sync.md"'),
  },
  async ({ path: notePath }) => {
    const data = await api('laguz', `/api/note?path=${encodeURIComponent(notePath)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'laguz_get_meetings',
  'Get all meeting notes for a company, ordered by date descending',
  {
    company: z.string().describe('Company name'),
    since: z.string().optional().describe('Only meetings on or after this date (YYYY-MM-DD)'),
  },
  async ({ company, since }) => {
    const params = new URLSearchParams({ company });
    if (since) params.set('since', since);
    const data = await api('laguz', `/api/meetings?${params}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.notes, null, 2) }] };
  }
);

server.tool(
  'laguz_get_account',
  'Get all non-meeting notes for a company (account docs, strategies, etc.)',
  {
    company: z.string().describe('Company name'),
  },
  async ({ company }) => {
    const data = await api('laguz', `/api/account?path=${encodeURIComponent(company)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.notes, null, 2) }] };
  }
);

server.tool(
  'laguz_get_unprocessed',
  'Get meeting notes where processed=false. Useful for finding meetings that need follow-up.',
  {
    since: z.string().optional().describe('Only meetings on or after this date (YYYY-MM-DD)'),
  },
  async ({ since }) => {
    const params = new URLSearchParams();
    if (since) params.set('since', since);
    const data = await api('laguz', `/api/unprocessed?${params}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.notes, null, 2) }] };
  }
);

server.tool(
  'laguz_write_note',
  'Write or update a note in the vault. Creates parent directories if needed. Re-indexes after write.',
  {
    path: z.string().describe('Vault-relative path, e.g. "meetings/2026-02-17 - New Meeting.md"'),
    content: z.string().describe('Full markdown content including frontmatter'),
  },
  async ({ path: notePath, content }) => {
    const data = await api('laguz', '/api/note', {
      method: 'POST',
      body: JSON.stringify({ path: notePath, content }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Start Server ────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Futhark MCP] Server started on stdio — 67 tools across 4 apps');
}

main().catch((e) => {
  console.error('[Futhark MCP] Fatal error:', e);
  process.exit(1);
});
