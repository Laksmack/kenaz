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
  version: '1.6.0',
});

// ═══════════════════════════════════════════════════════════
// META TOOLS
// ═══════════════════════════════════════════════════════════

server.tool(
  'futhark_status',
  'Check which Futhark apps are currently running. Returns reachability status for Kenaz (email), Raidō (tasks), Dagaz (calendar), and Laguz (notes). Also returns vault path for Laguz if running.',
  {},
  async () => {
    const results = await Promise.all(
      (Object.keys(APPS) as AppName[]).map(async (app) => {
        const running = await isReachable(app);
        const entry: any = {
          app: APPS[app].name,
          description: APPS[app].desc,
          port: portFor(app),
          running,
        };
        if (app === 'laguz' && running) {
          try {
            const health = await api('laguz', '/api/health');
            if (health.vault_path) entry.vault_path = health.vault_path;
          } catch { /* ignore */ }
        }
        return entry;
      })
    );
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  }
);

// ═══════════════════════════════════════════════════════════
// KENAZ — Email, CRM, Calendar (port 3141)
// ═══════════════════════════════════════════════════════════

function compactThread(t: any) {
  const th: any = { id: t.id, subject: t.subject };
  if (t.from) th.from = t.from.name || t.from.email;
  th.date = t.lastDate;
  if (t.snippet) th.snippet = t.snippet;
  if (t.messages?.length) th.messages = t.messages.length;
  if (t.isUnread) th.unread = true;
  if (t.nudgeType) th.nudge = t.nudgeType;
  return th;
}

function compactThreads(threads: any[]) {
  return JSON.stringify(threads.map(compactThread));
}

// ── Read ──

server.tool(
  'kenaz_get_inbox',
  'Get recent inbox threads (compact summaries). Use kenaz_get_thread_summary or kenaz_get_thread for full details on a specific thread.',
  {},
  async () => {
    const data = await api('kenaz', '/api/inbox');
    return { content: [{ type: 'text', text: compactThreads(data.threads) }] };
  }
);

server.tool(
  'kenaz_get_unread',
  'Get unread inbox threads (compact summaries) with count. Use kenaz_get_thread_summary or kenaz_get_thread for full details.',
  {},
  async () => {
    const data = await api('kenaz', '/api/unread');
    return { content: [{ type: 'text', text: JSON.stringify({ count: data.count, threads: data.threads.map(compactThread) }) }] };
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
  'Search emails using Gmail query syntax (e.g. "from:user@example.com", "subject:invoice", "is:unread", "after:2026/01/01"). To find sent emails, prefer "from:me" over "in:sent" — from:me catches replies in received threads too. If you use "in:sent", it will be auto-translated to "from:me". Returns compact summaries. Use kenaz_get_thread_summary or kenaz_get_thread for full details on a specific thread.',
  { query: z.string().describe('Gmail search query') },
  async ({ query }) => {
    const rewritten = query.replace(/\bin:sent\b/gi, 'from:me');
    const data = await api('kenaz', `/api/search?q=${encodeURIComponent(rewritten)}`);
    return { content: [{ type: 'text', text: compactThreads(data.threads) }] };
  }
);

server.tool(
  'kenaz_get_thread',
  'Get complete thread details: all messages with full bodies, recipients, attachment metadata. Only use when you explicitly need the full content.',
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
  'kenaz_attachment',
  'Email attachment operations. Actions: "list" (list attachments in a thread, requires thread_id), "download" (download one attachment, requires message_id + attachment_id + filename), "download_all" (download all as zip, requires thread_id).',
  {
    action: z.enum(['list', 'download', 'download_all']).describe('Attachment operation'),
    thread_id: z.string().optional().describe('Gmail thread ID (for list, download_all)'),
    message_id: z.string().optional().describe('Gmail message ID (for download)'),
    attachment_id: z.string().optional().describe('Attachment ID from list (for download)'),
    filename: z.string().optional().describe('Filename to save as (for download)'),
  },
  async ({ action, thread_id, message_id, attachment_id, filename }) => {
    switch (action) {
      case 'list': {
        if (!thread_id) return { content: [{ type: 'text', text: 'Error: list requires thread_id' }] };
        const data = await api('kenaz', `/api/thread/${thread_id}/attachments`);
        return { content: [{ type: 'text', text: JSON.stringify(data.attachments, null, 2) }] };
      }
      case 'download': {
        if (!message_id || !attachment_id || !filename) return { content: [{ type: 'text', text: 'Error: download requires message_id, attachment_id, and filename' }] };
        const data = await api('kenaz', `/api/attachment/${message_id}/${attachment_id}/download?filename=${encodeURIComponent(filename)}`, { method: 'POST' });
        return { content: [{ type: 'text', text: `Downloaded to: ${data.path}` }] };
      }
      case 'download_all': {
        if (!thread_id) return { content: [{ type: 'text', text: 'Error: download_all requires thread_id' }] };
        const listData = await api('kenaz', `/api/thread/${thread_id}/attachments`);
        const attachments = listData.attachments || [];
        if (attachments.length === 0) return { content: [{ type: 'text', text: 'No attachments found in this thread.' }] };

        const url = `${baseUrl('kenaz')}/api/thread/${thread_id}/attachments/download-all`;
        const res = await fetch(url);
        if (!res.ok) { const text = await res.text(); throw new Error(`Failed to download: ${text}`); }

        const downloadsDir = join(homedir(), 'Downloads');
        let filePath = join(downloadsDir, `attachments-${thread_id}.zip`);
        let counter = 1;
        while (existsSync(filePath)) { filePath = join(downloadsDir, `attachments-${thread_id} (${counter}).zip`); counter++; }

        const buffer = Buffer.from(await res.arrayBuffer());
        writeFileSync(filePath, buffer);

        const fileList = attachments.map((a: any) => `  - ${a.filename} (${(a.size / 1024).toFixed(1)} KB)`).join('\n');
        return { content: [{ type: 'text', text: `Downloaded ${attachments.length} attachments to:\n${filePath}\n\nFiles:\n${fileList}` }] };
      }
    }
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
    let attachmentMeta: { filename: string; size_bytes: number }[] = [];

    if (attachment_paths && attachment_paths.length > 0) {
      const attachments = attachment_paths.map(readFileAsAttachment);
      attachmentMeta = attachments.map(a => ({ filename: a.filename, size_bytes: a.size }));
      payload.attachments = attachments;
    }

    const data = await api('kenaz', '/api/draft', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const result: any = {
      drafted: true,
      draft_id: data.draftId,
      subject: params.subject,
      to: params.to,
    };
    if (attachmentMeta.length > 0) result.attachments = attachmentMeta;
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
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
    let attachmentMeta: { filename: string; size_bytes: number }[] = [];

    if (attachment_paths && attachment_paths.length > 0) {
      const attachments = attachment_paths.map(readFileAsAttachment);
      attachmentMeta = attachments.map(a => ({ filename: a.filename, size_bytes: a.size }));
      payload.attachments = attachments;
    }

    const data = await api('kenaz', '/api/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const result: any = {
      sent: true,
      message_id: data.id,
      thread_id: data.threadId,
      subject: params.subject,
      to: params.to,
    };
    if (attachmentMeta.length > 0) result.attachments = attachmentMeta;
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// ── Drafts ──

server.tool(
  'kenaz_draft',
  'Manage email drafts. Actions: "list" (all drafts), "get" (full body, requires draft_id), "delete" (requires draft_id). To create a draft, use kenaz_draft_email instead.',
  {
    action: z.enum(['list', 'get', 'delete']).describe('Draft operation'),
    draft_id: z.string().optional().describe('Draft ID (required for get/delete)'),
  },
  async ({ action, draft_id }) => {
    switch (action) {
      case 'list': {
        const data = await api('kenaz', '/api/drafts');
        return { content: [{ type: 'text', text: JSON.stringify(data.drafts, null, 2) }] };
      }
      case 'get': {
        if (!draft_id) return { content: [{ type: 'text', text: 'Error: get requires draft_id' }] };
        const data = await api('kenaz', `/api/draft/${draft_id}`);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      case 'delete': {
        if (!draft_id) return { content: [{ type: 'text', text: 'Error: delete requires draft_id' }] };
        await api('kenaz', `/api/draft/${draft_id}`, { method: 'DELETE' });
        return { content: [{ type: 'text', text: 'Draft deleted.' }] };
      }
    }
  }
);

// ── Email Actions ──

server.tool(
  'kenaz_thread_action',
  'Perform actions on email threads. Actions: "archive" (remove from inbox), "trash" (move to trash), "label" (add/remove labels like STARRED, UNREAD, IMPORTANT), "batch_archive" (archive multiple threads). Use thread_id for single-thread actions, thread_ids for batch.',
  {
    action: z.enum(['archive', 'trash', 'label', 'batch_archive']).describe('Thread action'),
    thread_id: z.string().optional().describe('Thread ID (for archive, trash, label)'),
    thread_ids: z.array(z.string()).optional().describe('Thread IDs (for batch_archive)'),
    add_label: z.string().optional().describe('Label to add (for label action)'),
    remove_label: z.string().optional().describe('Label to remove (for label action)'),
  },
  async ({ action, thread_id, thread_ids, add_label, remove_label }) => {
    switch (action) {
      case 'archive': {
        if (!thread_id) return { content: [{ type: 'text', text: 'Error: archive requires thread_id' }] };
        await api('kenaz', `/api/archive/${thread_id}`, { method: 'POST' });
        return { content: [{ type: 'text', text: `Thread ${thread_id} archived.` }] };
      }
      case 'trash': {
        if (!thread_id) return { content: [{ type: 'text', text: 'Error: trash requires thread_id' }] };
        await api('kenaz', `/api/thread/${thread_id}`, { method: 'DELETE' });
        return { content: [{ type: 'text', text: `Thread ${thread_id} trashed.` }] };
      }
      case 'label': {
        if (!thread_id) return { content: [{ type: 'text', text: 'Error: label requires thread_id' }] };
        await api('kenaz', `/api/label/${thread_id}`, { method: 'POST', body: JSON.stringify({ add: add_label || null, remove: remove_label || null }) });
        return { content: [{ type: 'text', text: `Labels updated on thread ${thread_id}.` }] };
      }
      case 'batch_archive': {
        if (!thread_ids?.length) return { content: [{ type: 'text', text: 'Error: batch_archive requires thread_ids' }] };
        const data = await api('kenaz', '/api/batch/archive', { method: 'POST', body: JSON.stringify({ threadIds: thread_ids }) });
        return { content: [{ type: 'text', text: `Archived ${data.archived} threads.` }] };
      }
    }
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
  'kenaz_hubspot',
  'HubSpot CRM operations. Actions: "lookup" (contact by email), "deals" (list active deals, optional stage/owner filter), "activities" (recent activities for a contact email).',
  {
    action: z.enum(['lookup', 'deals', 'activities']).describe('HubSpot operation'),
    email: z.string().optional().describe('Contact email (for lookup, activities)'),
    stage: z.string().optional().describe('Filter by deal stage (for deals)'),
    owner: z.string().optional().describe('Filter by owner ID (for deals)'),
    limit: z.number().optional().describe('Max results (for activities, default 10)'),
  },
  async ({ action, email, stage, owner, limit }) => {
    switch (action) {
      case 'lookup': {
        if (!email) return { content: [{ type: 'text', text: 'Error: lookup requires email' }] };
        const data = await api('kenaz', `/api/hubspot/contact/${encodeURIComponent(email)}`);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      case 'deals': {
        const params = new URLSearchParams();
        if (stage) params.set('stage', stage);
        if (owner) params.set('owner', owner);
        const qs = params.toString();
        const data = await api('kenaz', `/api/hubspot/deals${qs ? '?' + qs : ''}`);
        return { content: [{ type: 'text', text: JSON.stringify(data.deals, null, 2) }] };
      }
      case 'activities': {
        if (!email) return { content: [{ type: 'text', text: 'Error: activities requires email' }] };
        const qs = limit ? `?limit=${limit}` : '';
        const data = await api('kenaz', `/api/hubspot/recent/${encodeURIComponent(email)}${qs}`);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    }
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

function compactEvent(e: any) {
  const ev: any = { id: e.id, title: e.summary };
  if (e.all_day) {
    ev.date = e.start_date;
    if (e.end_date && e.end_date !== e.start_date) ev.end_date = e.end_date;
    ev.all_day = true;
  } else {
    ev.start = e.start_time;
    ev.end = e.end_time;
  }
  if (e.location) ev.location = e.location.split('\n')[0];
  if (e.attendees?.length) ev.attendees = e.attendees.length;
  if (e.hangout_link || e.conference_data) ev.has_video = true;
  if (e.status !== 'confirmed') ev.status = e.status;
  if (e.self_response && e.self_response !== 'accepted') ev.rsvp = e.self_response;
  if (e.recurrence_rule) ev.recurring = true;
  if (e.calendar_id) ev.calendar_id = e.calendar_id;
  return ev;
}

function compactEvents(events: any[]) {
  return JSON.stringify(events.map(compactEvent));
}

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
  'Get events in a date range (compact summaries). Use dagaz_get_event_full for complete details on a specific event.',
  {
    start: z.string().describe('ISO date/datetime (e.g. "2026-02-16" or "2026-02-16T09:00:00")'),
    end: z.string().describe('ISO date/datetime'),
    calendar_id: z.string().optional().describe('Filter to a specific calendar ID'),
  },
  async ({ start, end, calendar_id }) => {
    let url = `/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    if (calendar_id) url += `&calendar=${encodeURIComponent(calendar_id)}`;
    const data = await api('dagaz', url);
    return { content: [{ type: 'text', text: compactEvents(data.events) }] };
  }
);

server.tool(
  'dagaz_get_event',
  'Get a single event (compact). Returns title, time, location, attendee count, video link flag. Use dagaz_get_event_full for description, attendee list, conferencing details, etc.',
  { event_id: z.string().describe('Event ID (local UUID or Google Calendar ID — either works)') },
  async ({ event_id }) => {
    const data = await api('dagaz', `/api/events/${encodeURIComponent(event_id)}`);
    return { content: [{ type: 'text', text: JSON.stringify(compactEvent(data)) }] };
  }
);

server.tool(
  'dagaz_get_event_full',
  'Get complete event details: full description, attendee list with RSVP statuses, conferencing links, attachments, recurrence rules. Only use when the user explicitly needs these details.',
  { event_id: z.string().describe('Event ID (local UUID or Google Calendar ID — either works)') },
  async ({ event_id }) => {
    const data = await api('dagaz', `/api/events/${encodeURIComponent(event_id)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'dagaz_get_today',
  "Get today's events (compact summaries). Use dagaz_get_event_full for complete details on a specific event.",
  {},
  async () => {
    const data = await api('dagaz', '/api/today');
    return { content: [{ type: 'text', text: compactEvents(data.events) }] };
  }
);

server.tool(
  'dagaz_get_agenda',
  'Get agenda for a date range — compact summaries. Defaults to next 7 days. Use dagaz_get_event_full for complete details.',
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
    return { content: [{ type: 'text', text: compactEvents(data.events) }] };
  }
);

server.tool(
  'dagaz_find_availability',
  'Find available time slots. For free/busy checking, pass calendar_ids. For meeting scheduling with multiple people, also pass attendees and duration_minutes to get ranked suggestions.',
  {
    start: z.string().describe('Search range start (ISO datetime)'),
    end: z.string().describe('Search range end (ISO datetime)'),
    calendar_ids: z.array(z.string()).optional().describe('Calendar IDs or email addresses to check free/busy'),
    attendees: z.array(z.string()).optional().describe('Attendee emails (for meeting time suggestions)'),
    duration_minutes: z.number().optional().describe('Meeting length in minutes (for meeting time suggestions)'),
  },
  async ({ start, end, calendar_ids, attendees, duration_minutes }) => {
    if (attendees && duration_minutes) {
      const url = `/api/find-meeting-time?attendees=${encodeURIComponent(attendees.join(','))}&duration_minutes=${duration_minutes}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
      const data = await api('dagaz', url);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
    const calendars = (calendar_ids || []).join(',');
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
  'dagaz_meeting_context',
  'Cross-app context for meetings and day planning. Types: "event" (attendee details + emails + CRM for one event), "meeting_prep" (full briefing: attendees + email history + CRM + related tasks), "day_plan" (combined events + tasks for a date).',
  {
    type: z.enum(['event', 'meeting_prep', 'day_plan']).describe('Context type'),
    event_id: z.string().optional().describe('Event ID (for event, meeting_prep)'),
    date: z.string().optional().describe('ISO date YYYY-MM-DD (for day_plan, defaults to today)'),
  },
  async ({ type, event_id, date }) => {
    switch (type) {
      case 'event': {
        if (!event_id) return { content: [{ type: 'text', text: 'Error: event requires event_id' }] };
        const data = await api('dagaz', `/api/events/${encodeURIComponent(event_id)}/context`);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      case 'meeting_prep': {
        if (!event_id) return { content: [{ type: 'text', text: 'Error: meeting_prep requires event_id' }] };
        const contextData = await api('dagaz', `/api/events/${encodeURIComponent(event_id)}/context`);
        let relatedTasks: any[] = [];
        try {
          const event = contextData.event;
          if (event?.summary) {
            const raidoRes = await fetch(`${baseUrl('raido')}/api/search?q=${encodeURIComponent(event.summary)}`, { signal: AbortSignal.timeout(3000) });
            if (raidoRes.ok) { const data = await raidoRes.json(); relatedTasks = (data.tasks || []).slice(0, 5); }
          }
        } catch { /* Raidō not available */ }
        return { content: [{ type: 'text', text: JSON.stringify({ event: contextData.event, attendeeContext: contextData.emailThreads || [], hubspotContacts: contextData.hubspotContacts || [], relatedTasks }, null, 2) }] };
      }
      case 'day_plan': {
        let url = '/api/day-plan';
        if (date) url += `?date=${encodeURIComponent(date)}`;
        const data = await api('dagaz', url);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    }
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
    recurrence: z.enum(['daily', 'weekdays', 'weekly', 'biweekly', 'monthly']).optional().describe('Repeat pattern. When completed, a new instance is auto-created with the next due date.'),
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
    recurrence: z.enum(['daily', 'weekdays', 'weekly', 'biweekly', 'monthly']).nullable().optional().describe('Set or clear repeat pattern'),
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
  'raido_search',
  'Search tasks by title or notes. Supports optional filters for tags and status.',
  {
    query: z.string().describe('Search query'),
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

// ── Checklist Items ──

server.tool(
  'raido_checklist',
  'Manage checklist items (sub-steps) on a task. Actions: "add" (requires task_id + title), "update" (requires item_id, optional title/completed), "delete" (requires item_id).',
  {
    action: z.enum(['add', 'update', 'delete']).describe('Checklist operation'),
    task_id: z.string().optional().describe('Task ID (required for add)'),
    item_id: z.string().optional().describe('Checklist item ID (required for update/delete)'),
    title: z.string().optional().describe('Item text (required for add, optional for update)'),
    completed: z.boolean().optional().describe('Toggle completed state (for update)'),
  },
  async ({ action, task_id, item_id, title, completed }) => {
    switch (action) {
      case 'add': {
        if (!task_id || !title) return { content: [{ type: 'text', text: 'Error: add requires task_id and title' }] };
        const data = await api('raido', `/api/task/${task_id}/checklist`, { method: 'POST', body: JSON.stringify({ title }) });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      case 'update': {
        if (!item_id) return { content: [{ type: 'text', text: 'Error: update requires item_id' }] };
        const data = await api('raido', `/api/checklist/${item_id}`, { method: 'PUT', body: JSON.stringify({ title, completed }) });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      case 'delete': {
        if (!item_id) return { content: [{ type: 'text', text: 'Error: delete requires item_id' }] };
        const data = await api('raido', `/api/checklist/${item_id}`, { method: 'DELETE' });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    }
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

server.tool(
  'laguz_get_fields',
  'Extract specific fields from a markdown note without loading the full file. Checks YAML frontmatter first, then falls back to markdown section headers (## Next Steps → next_steps). Frontmatter wins if a field appears in both.',
  {
    path: z.string().describe('Vault-relative path, e.g. "meetings/Tesla/2026-02-20 - EBIF AI Session.md"'),
    fields: z.array(z.string()).describe('Field names to extract. Matched against frontmatter keys and section headers via snake_case normalization.'),
  },
  async ({ path: notePath, fields }) => {
    const data = await api('laguz', '/api/note/fields', {
      method: 'POST',
      body: JSON.stringify({ path: notePath, fields }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'laguz_update_frontmatter',
  'Update specific YAML frontmatter fields in a markdown note without rewriting the entire file. Set a field to null to remove it. Re-indexes after update.',
  {
    path: z.string().describe('Vault-relative path, e.g. "meetings/2026-02-17 - Tesla Sync.md"'),
    fields: z.record(z.any()).describe('Key-value pairs to set or update in the frontmatter. Set a value to null to remove the field.'),
  },
  async ({ path: notePath, fields }) => {
    const data = await api('laguz', '/api/note/frontmatter', {
      method: 'POST',
      body: JSON.stringify({ path: notePath, fields }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Laguz: PDF ──────────────────────────────────────────────

server.tool(
  'laguz_pdf',
  'PDF operations. Actions: "read" (extract text), "info" (metadata), "fields" (detect blank fields), "annotate" (add highlight/underline/text), "fill" (fill a detected field), "sign" (stamp stored signature), "flatten" (bake annotations into final copy). All accept vault-relative or absolute paths. Typical signing workflow: laguz_pdf(read) → laguz_pdf(fields) → laguz_pdf(fill) → laguz_pdf(sign) → laguz_pdf(flatten) → kenaz_draft_email with attachment.',
  {
    action: z.enum(['read', 'info', 'fields', 'annotate', 'fill', 'sign', 'flatten']).describe('PDF operation to perform'),
    path: z.string().describe('Path to the PDF — vault-relative or absolute'),
    page: z.number().optional().describe('Zero-based page index (for annotate, sign)'),
    annotation_type: z.enum(['highlight', 'underline', 'text-note', 'text-box']).optional().describe('For annotate action'),
    rect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional().describe('Bounding rectangle in PDF coordinates (for annotate, sign)'),
    field_rect: z.object({ page: z.number(), x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional().describe('Field position (for fill action)'),
    text: z.string().optional().describe('Text content (for annotate text-note/text-box)'),
    value: z.string().optional().describe('Text value to fill (for fill action)'),
    color: z.string().optional().describe('Hex color for annotations (default #4AA89A)'),
    signature_name: z.string().optional().describe('Stored signature name (for sign action, uses default if omitted)'),
    output_path: z.string().optional().describe('Output path for flatten (defaults to "(signed)" suffix)'),
  },
  async ({ action, path: pdfPath, page, annotation_type, rect, field_rect, text, value, color, signature_name, output_path }) => {
    switch (action) {
      case 'read': {
        const data = await api('laguz', `/api/pdf/text?path=${encodeURIComponent(pdfPath)}`);
        return { content: [{ type: 'text', text: data.text || '[No text extracted]' }] };
      }
      case 'info': {
        const data = await api('laguz', `/api/pdf/info?path=${encodeURIComponent(pdfPath)}`);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      case 'fields': {
        const data = await api('laguz', `/api/pdf/fields?path=${encodeURIComponent(pdfPath)}`);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      case 'annotate': {
        if (page === undefined || !annotation_type || !rect) return { content: [{ type: 'text', text: 'Error: annotate requires page, annotation_type, and rect' }] };
        await api('laguz', '/api/pdf/annotate', {
          method: 'POST',
          body: JSON.stringify({ path: pdfPath, annotation: { id: `ann-${Date.now()}`, type: annotation_type, page, rect, text, color: color || '#4AA89A', author: 'claude' } }),
        });
        return { content: [{ type: 'text', text: `Annotation added to page ${page + 1}` }] };
      }
      case 'fill': {
        if (!field_rect || !value) return { content: [{ type: 'text', text: 'Error: fill requires field_rect and value' }] };
        await api('laguz', '/api/pdf/fill-field', { method: 'POST', body: JSON.stringify({ path: pdfPath, field_rect, value }) });
        return { content: [{ type: 'text', text: `Field filled with "${value}" on page ${field_rect.page + 1}` }] };
      }
      case 'sign': {
        if (page === undefined || !rect) return { content: [{ type: 'text', text: 'Error: sign requires page and rect' }] };
        await api('laguz', '/api/pdf/sign', { method: 'POST', body: JSON.stringify({ path: pdfPath, page, rect, signature_name }) });
        return { content: [{ type: 'text', text: `Signature placed on page ${page + 1}` }] };
      }
      case 'flatten': {
        const data = await api('laguz', '/api/pdf/flatten', { method: 'POST', body: JSON.stringify({ path: pdfPath, output_path }) });
        return { content: [{ type: 'text', text: `Flattened PDF saved to: ${data.output_path}` }] };
      }
    }
  }
);

server.tool(
  'laguz_sidecar',
  'Read or write the companion .md sidecar note for a PDF. Omit content to read, provide content to write.',
  {
    path: z.string().describe('Path to the PDF — vault-relative or absolute'),
    content: z.string().optional().describe('Markdown content to write. Omit to read existing sidecar.'),
  },
  async ({ path: pdfPath, content }) => {
    if (content !== undefined) {
      await api('laguz', '/api/pdf/sidecar', { method: 'POST', body: JSON.stringify({ path: pdfPath, content }) });
      return { content: [{ type: 'text', text: 'Sidecar note updated' }] };
    }
    const data = await api('laguz', `/api/pdf/sidecar?path=${encodeURIComponent(pdfPath)}`);
    return { content: [{ type: 'text', text: data.content || '[No sidecar notes]' }] };
  }
);

// ── Laguz: Read Attachment ───────────────────────────────────

server.tool(
  'laguz_read_attachment',
  'Read the content of an attachment file in the Laguz vault. Supports PDF (text extraction with optional page range), DOCX (plain text), images (metadata only — no base64), and CSV/TXT (raw text, truncated at 50KB). Always returns text only — never binary or base64.',
  {
    path: z.string().describe('Path to the attachment — either vault-relative (e.g. "_attachments/report.pdf") or absolute'),
    page_range: z.string().optional().describe('For PDFs only: page range like "1-3" or "5" to read specific pages. Omit to read all pages.'),
  },
  async ({ path: filePath, page_range }) => {
    const params = new URLSearchParams({ path: filePath });
    if (page_range) params.set('page_range', page_range);
    const data = await api('laguz', `/api/attachment/read?${params}`);
    const parts: string[] = [];

    if (data.type === 'pdf') {
      parts.push(`**PDF:** ${filePath} (${data.page_count} pages)`);
      if (data.text) parts.push(data.text);
    } else if (data.type === 'docx') {
      parts.push(`**DOCX:** ${filePath}`);
      if (data.text) parts.push(data.text);
      if (data.truncated) parts.push(`\n_${data.note}_`);
    } else if (data.type === 'image') {
      parts.push(`**Image:** ${data.filename}`);
      parts.push(`- Extension: ${data.extension}`);
      parts.push(`- Size: ${data.size_human} (${data.size_bytes} bytes)`);
      parts.push(`- Path: ${data.path}`);
      parts.push(data.note);
    } else {
      parts.push(`**File:** ${filePath}`);
      if (data.text) parts.push(data.text);
      if (data.truncated) parts.push(`\n_${data.note}_`);
    }

    return { content: [{ type: 'text', text: parts.join('\n') }] };
  }
);

// ── Laguz: Context ──────────────────────────────────────────

server.tool(
  'laguz_get_context',
  'Get aggregated context for a vault folder: notes from Laguz, related email threads from Kenaz, related tasks from Raidō, and upcoming events from Dagaz. Ideal for answering "what\'s the latest on [Company]?"',
  {
    folder_name: z.string().describe('Folder name to look up, e.g. "Conagra". Matches vault subfolder names.'),
  },
  async ({ folder_name }) => {
    const data = await api('laguz', `/api/context?name=${encodeURIComponent(folder_name)}`);
    const sections: string[] = [];

    sections.push(`# Context: ${folder_name}\nVault folder: ${data.folder}\n`);

    if (data.notes?.length > 0) {
      sections.push('## Notes');
      for (const n of data.notes) {
        sections.push(`- **${n.title}** (${n.type || 'note'}) — ${n.date || 'no date'} — ${n.word_count} words — \`${n.path}\``);
      }
    } else {
      sections.push('## Notes\n_No notes found in this folder._');
    }

    if (data.emails?.length > 0) {
      sections.push('\n## Recent Emails');
      for (const e of data.emails) {
        const from = e.from?.name || e.from?.email || 'Unknown';
        sections.push(`- **${e.subject || '(no subject)'}** from ${from} — ${e.date || ''} — thread:${e.id}`);
      }
    } else {
      sections.push('\n## Recent Emails\n_No related emails found (Kenaz may not be running)._');
    }

    if (data.tasks?.length > 0) {
      sections.push('\n## Tasks');
      for (const t of data.tasks) {
        const status = t.status === 'completed' ? '\u2705' : '\u25CB';
        sections.push(`- ${status} **${t.title}** — due: ${t.due_date || 'none'} — id:${t.id}`);
      }
    } else {
      sections.push('\n## Tasks\n_No related tasks found (Raidō may not be running)._');
    }

    if (data.events?.length > 0) {
      sections.push('\n## Upcoming Events');
      for (const ev of data.events) {
        const start = ev.start?.dateTime || ev.start?.date || ev.start || '';
        sections.push(`- **${ev.summary || '(no title)'}** — ${start}${ev.location ? ` — ${ev.location}` : ''}`);
      }
    } else {
      sections.push('\n## Upcoming Events\n_No related events found (Dagaz may not be running)._');
    }

    return { content: [{ type: 'text', text: sections.join('\n') }] };
  }
);

server.tool(
  'laguz_get_vault_folders',
  'List all folders in the vault. Returns folder names and paths. Useful for discovering available folders before using laguz_get_context.',
  {},
  async () => {
    const data = await api('laguz', '/api/folders');
    return { content: [{ type: 'text', text: JSON.stringify(data.folders, null, 2) }] };
  }
);

server.tool(
  'laguz_get_vault_info',
  'Get the vault root path and basic info. Call this first if you need to know where the vault is on disk.',
  {},
  async () => {
    const data = await api('laguz', '/api/health');
    const folders = await api('laguz', '/api/folders');
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          vault_path: data.vault_path,
          folder_count: folders.folders?.length ?? 0,
          attachments_dir: `${data.vault_path}/_attachments`,
        }, null, 2),
      }],
    };
  }
);

// ── Start Server ────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Futhark MCP] Server started on stdio — 62 tools across 4 apps');
}

main().catch((e) => {
  console.error('[Futhark MCP] Fatal error:', e);
  process.exit(1);
});
