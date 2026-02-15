#!/usr/bin/env node
/**
 * Kenaz MCP Server
 *
 * A Model Context Protocol server that exposes Kenaz email client capabilities
 * to Claude Desktop and other MCP-compatible clients.
 *
 * Architecture: This runs as a standalone stdio process spawned by Claude Desktop.
 * It proxies requests to the Kenaz API server running inside the Electron app.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = `http://localhost:${process.env.KENAZ_API_PORT || 3141}`;

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
      throw new Error(`Kenaz API error ${res.status}: ${text}`);
    }
    return res.json();
  } catch (e: any) {
    if (e.cause?.code === 'ECONNREFUSED') {
      throw new Error('Kenaz is not running. Please open the Kenaz app first.');
    }
    throw e;
  }
}

// ── MCP Server ──────────────────────────────────────────────

const server = new McpServer({
  name: 'kenaz',
  version: '1.0.0',
});

// ── Tools: Email Read ───────────────────────────────────────

server.tool(
  'get_inbox',
  'Get the most recent inbox threads (up to 50)',
  {},
  async () => {
    const data = await api('/api/inbox');
    return { content: [{ type: 'text', text: JSON.stringify(data.threads, null, 2) }] };
  }
);

server.tool(
  'get_unread',
  'Get unread inbox threads with count',
  {},
  async () => {
    const data = await api('/api/unread');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'get_stats',
  'Get inbox statistics: counts for inbox, unread, starred, pending, todo, drafts',
  {},
  async () => {
    const data = await api('/api/stats');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'search_emails',
  'Search emails using Gmail query syntax (e.g. "from:user@example.com", "subject:invoice", "is:unread", "after:2026/01/01"). Returns up to 50 matching threads.',
  { query: z.string().describe('Gmail search query') },
  async ({ query }) => {
    const data = await api(`/api/search?q=${encodeURIComponent(query)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.threads, null, 2) }] };
  }
);

server.tool(
  'get_thread',
  'Get a full email thread with all messages, bodies, and attachment metadata',
  { thread_id: z.string().describe('Gmail thread ID') },
  async ({ thread_id }) => {
    const data = await api(`/api/email/${thread_id}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'get_thread_summary',
  'Get an AI-ready thread summary: participants, timeline, latest message body. Ideal for understanding context before drafting a reply.',
  { thread_id: z.string().describe('Gmail thread ID') },
  async ({ thread_id }) => {
    const data = await api(`/api/thread/${thread_id}/summary`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tools: Email Write ──────────────────────────────────────

server.tool(
  'draft_email',
  'Create an email draft in Kenaz for review before sending. Supports markdown body (auto-converted to HTML). Use reply_to_thread_id to make it a reply.',
  {
    to: z.string().describe('Comma-separated recipient emails'),
    subject: z.string().describe('Email subject'),
    body_markdown: z.string().describe('Email body in markdown (converted to HTML)'),
    cc: z.string().optional().describe('Comma-separated CC emails'),
    bcc: z.string().optional().describe('Comma-separated BCC emails'),
    reply_to_thread_id: z.string().optional().describe('Thread ID to reply to (makes this a reply)'),
    reply_to_message_id: z.string().optional().describe('Message ID for In-Reply-To header'),
  },
  async (params) => {
    const data = await api('/api/draft', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return { content: [{ type: 'text', text: `Draft created: ${data.draftId}` }] };
  }
);

server.tool(
  'send_email',
  'Send an email immediately. Use draft_email instead if the user should review first. Supports markdown body.',
  {
    to: z.string().describe('Comma-separated recipient emails'),
    subject: z.string().describe('Email subject'),
    body_markdown: z.string().describe('Email body in markdown (converted to HTML)'),
    cc: z.string().optional().describe('Comma-separated CC emails'),
    bcc: z.string().optional().describe('Comma-separated BCC emails'),
    reply_to_thread_id: z.string().optional().describe('Thread ID to reply to'),
    reply_to_message_id: z.string().optional().describe('Message ID for In-Reply-To header'),
  },
  async (params) => {
    const data = await api('/api/send', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return { content: [{ type: 'text', text: `Email sent. Message ID: ${data.id}, Thread ID: ${data.threadId}` }] };
  }
);

// ── Tools: Drafts ───────────────────────────────────────────

server.tool(
  'list_drafts',
  'List all email drafts',
  {},
  async () => {
    const data = await api('/api/drafts');
    return { content: [{ type: 'text', text: JSON.stringify(data.drafts, null, 2) }] };
  }
);

server.tool(
  'get_draft',
  'Get a draft with full body content',
  { draft_id: z.string().describe('Draft ID') },
  async ({ draft_id }) => {
    const data = await api(`/api/draft/${draft_id}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'delete_draft',
  'Delete a draft',
  { draft_id: z.string().describe('Draft ID') },
  async ({ draft_id }) => {
    await api(`/api/draft/${draft_id}`, { method: 'DELETE' });
    return { content: [{ type: 'text', text: 'Draft deleted.' }] };
  }
);

// ── Tools: Email Actions ────────────────────────────────────

server.tool(
  'archive_thread',
  'Archive an email thread (remove from inbox)',
  { thread_id: z.string().describe('Thread ID to archive') },
  async ({ thread_id }) => {
    await api(`/api/archive/${thread_id}`, { method: 'POST' });
    return { content: [{ type: 'text', text: `Thread ${thread_id} archived.` }] };
  }
);

server.tool(
  'trash_thread',
  'Move an email thread to trash',
  { thread_id: z.string().describe('Thread ID to trash') },
  async ({ thread_id }) => {
    await api(`/api/thread/${thread_id}`, { method: 'DELETE' });
    return { content: [{ type: 'text', text: `Thread ${thread_id} trashed.` }] };
  }
);

server.tool(
  'modify_labels',
  'Add or remove labels from an email thread. Common labels: INBOX, STARRED, UNREAD, IMPORTANT. Custom labels use IDs from list_labels.',
  {
    thread_id: z.string().describe('Thread ID'),
    add: z.string().optional().describe('Label name to add'),
    remove: z.string().optional().describe('Label name to remove'),
  },
  async ({ thread_id, add, remove }) => {
    await api(`/api/label/${thread_id}`, {
      method: 'POST',
      body: JSON.stringify({ add: add || null, remove: remove || null }),
    });
    return { content: [{ type: 'text', text: `Labels updated on thread ${thread_id}.` }] };
  }
);

server.tool(
  'batch_archive',
  'Archive multiple email threads at once',
  { thread_ids: z.array(z.string()).describe('Array of thread IDs to archive') },
  async ({ thread_ids }) => {
    const data = await api('/api/batch/archive', {
      method: 'POST',
      body: JSON.stringify({ threadIds: thread_ids }),
    });
    return { content: [{ type: 'text', text: `Archived ${data.archived} threads.` }] };
  }
);

server.tool(
  'list_labels',
  'List all available Gmail labels (system + custom)',
  {},
  async () => {
    const data = await api('/api/labels');
    return { content: [{ type: 'text', text: JSON.stringify(data.labels, null, 2) }] };
  }
);

// ── Tools: HubSpot CRM ─────────────────────────────────────

server.tool(
  'hubspot_lookup',
  'Look up a HubSpot contact by email. Returns contact info, associated deals, and recent activities.',
  { email: z.string().describe('Contact email address') },
  async ({ email }) => {
    const data = await api(`/api/hubspot/contact/${encodeURIComponent(email)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'hubspot_deals',
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
    const data = await api(`/api/hubspot/deals${qs ? '?' + qs : ''}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.deals, null, 2) }] };
  }
);

server.tool(
  'hubspot_recent_activities',
  'Get recent HubSpot activities (emails, notes, meetings, calls) for a contact',
  {
    email: z.string().describe('Contact email address'),
    limit: z.number().optional().describe('Max results (default 10)'),
  },
  async ({ email, limit }) => {
    const qs = limit ? `?limit=${limit}` : '';
    const data = await api(`/api/hubspot/recent/${encodeURIComponent(email)}${qs}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tools: Combined Context ─────────────────────────────────

server.tool(
  'get_contact_context',
  'Get full context for a contact in one call: HubSpot contact info + deals + recent activities + last 5 email threads. Ideal before drafting an email.',
  { email: z.string().describe('Contact email address') },
  async ({ email }) => {
    const data = await api(`/api/context/${encodeURIComponent(email)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tools: Contacts ─────────────────────────────────────────

server.tool(
  'suggest_contacts',
  'Autocomplete contact suggestions based on a prefix. Searches names and emails, ranked by frequency.',
  {
    prefix: z.string().describe('Search prefix (name or email)'),
    limit: z.number().optional().describe('Max results (default 8)'),
  },
  async ({ prefix, limit }) => {
    // Contact suggest is via IPC in Electron, but we can search via the cache
    // For now, use the search endpoint as a workaround
    const data = await api(`/api/search?q=from:${encodeURIComponent(prefix)}+OR+to:${encodeURIComponent(prefix)}`);
    // Extract unique contacts from results
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

// ── Tools: Calendar ─────────────────────────────────────────

server.tool(
  'calendar_events',
  'List calendar events in a time range. Defaults to today.',
  {
    time_min: z.string().optional().describe('Start time (ISO format). Defaults to now.'),
    time_max: z.string().optional().describe('End time (ISO format). Defaults to end of today.'),
  },
  async ({ time_min, time_max }) => {
    const params = new URLSearchParams();
    if (time_min) params.set('timeMin', time_min);
    if (time_max) params.set('timeMax', time_max);
    const qs = params.toString();
    const data = await api(`/api/calendar/events${qs ? '?' + qs : ''}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.events, null, 2) }] };
  }
);

server.tool(
  'calendar_rsvp',
  'RSVP to a calendar event',
  {
    event_id: z.string().describe('Calendar event ID'),
    response: z.enum(['accepted', 'tentative', 'declined']).describe('RSVP response'),
  },
  async ({ event_id, response }) => {
    const data = await api(`/api/calendar/rsvp/${event_id}`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tools: Views & Rules ────────────────────────────────────

server.tool(
  'list_views',
  'List all email views (sidebar items with Gmail queries)',
  {},
  async () => {
    const data = await api('/api/views');
    return { content: [{ type: 'text', text: JSON.stringify(data.views, null, 2) }] };
  }
);

server.tool(
  'list_rules',
  'List all automation rules',
  {},
  async () => {
    const data = await api('/api/rules');
    return { content: [{ type: 'text', text: JSON.stringify(data.rules, null, 2) }] };
  }
);

// ── Start ───────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Kenaz MCP] Server started on stdio');
}

main().catch((e) => {
  console.error('[Kenaz MCP] Fatal error:', e);
  process.exit(1);
});
