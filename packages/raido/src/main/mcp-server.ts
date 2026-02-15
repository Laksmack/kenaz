#!/usr/bin/env node
/**
 * Raidō MCP Server
 *
 * A Model Context Protocol server that exposes Raidō task management capabilities
 * to Claude Desktop and other MCP-compatible clients.
 *
 * Architecture: This runs as a standalone stdio process spawned by Claude Desktop.
 * It proxies requests to the Raidō API server running inside the Electron app.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = `http://localhost:${process.env.RAIDO_API_PORT || 3142}`;

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
      throw new Error(`Raidō API error ${res.status}: ${text}`);
    }
    return res.json();
  } catch (e: any) {
    if (e.cause?.code === 'ECONNREFUSED') {
      throw new Error('Raidō is not running. Please open the Raidō app first.');
    }
    throw e;
  }
}

// ── MCP Server ──────────────────────────────────────────────

const server = new McpServer({
  name: 'raido',
  version: '1.0.0',
});

// ── Tools: Read ─────────────────────────────────────────────

server.tool(
  'get_today',
  "Get today's tasks plus any overdue tasks",
  {},
  async () => {
    const data = await api('/api/today');
    return { content: [{ type: 'text', text: JSON.stringify(data.tasks, null, 2) }] };
  }
);

server.tool(
  'get_inbox',
  'Get unprocessed tasks (no project, no scheduled date)',
  {},
  async () => {
    const data = await api('/api/inbox');
    return { content: [{ type: 'text', text: JSON.stringify(data.tasks, null, 2) }] };
  }
);

server.tool(
  'get_upcoming',
  'Get future scheduled tasks ordered by date',
  {},
  async () => {
    const data = await api('/api/upcoming');
    return { content: [{ type: 'text', text: JSON.stringify(data.tasks, null, 2) }] };
  }
);

server.tool(
  'get_someday',
  'Get tasks with no scheduled date (in a project but not scheduled)',
  {},
  async () => {
    const data = await api('/api/someday');
    return { content: [{ type: 'text', text: JSON.stringify(data.tasks, null, 2) }] };
  }
);

server.tool(
  'get_projects',
  'Get all open projects with task counts',
  {},
  async () => {
    const data = await api('/api/projects');
    return { content: [{ type: 'text', text: JSON.stringify(data.projects, null, 2) }] };
  }
);

server.tool(
  'get_project',
  'Get a project with all its tasks grouped by heading',
  { project_id: z.string().describe('Project ID') },
  async ({ project_id }) => {
    const data = await api(`/api/project/${project_id}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tools: Write ────────────────────────────────────────────

server.tool(
  'add_todo',
  'Create a new task',
  {
    title: z.string().describe('Task title'),
    notes: z.string().optional().describe('Markdown notes'),
    due_date: z.string().optional().describe('Due date (YYYY-MM-DD)'),
    when_date: z.string().optional().describe('Scheduled date (YYYY-MM-DD)'),
    project_id: z.string().optional().describe('Project to assign to'),
    tags: z.array(z.string()).optional().describe('Tags to apply'),
    priority: z.number().min(0).max(3).optional().describe('Priority: 0=none, 1=low, 2=medium, 3=high'),
    heading: z.string().optional().describe('Heading within project'),
    kenaz_thread_id: z.string().optional().describe('Linked Kenaz email thread ID'),
    hubspot_deal_id: z.string().optional().describe('Linked HubSpot deal ID'),
    vault_path: z.string().optional().describe('Linked Obsidian vault path'),
  },
  async (args) => {
    const data = await api('/api/task', {
      method: 'POST',
      body: JSON.stringify(args),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'update_todo',
  'Update an existing task',
  {
    id: z.string().describe('Task ID'),
    title: z.string().optional().describe('New title'),
    notes: z.string().optional().describe('New notes'),
    due_date: z.string().nullable().optional().describe('New due date or null to clear'),
    when_date: z.string().nullable().optional().describe('New scheduled date or null to clear'),
    completed: z.boolean().optional().describe('Mark as completed'),
    canceled: z.boolean().optional().describe('Mark as canceled'),
    priority: z.number().min(0).max(3).optional().describe('New priority'),
    tags: z.array(z.string()).optional().describe('Replace tags'),
  },
  async ({ id, completed, canceled, ...updates }) => {
    if (completed) {
      const data = await api(`/api/task/${id}/complete`, { method: 'POST' });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
    if (canceled) {
      (updates as any).status = 'canceled';
    }
    const data = await api(`/api/task/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'add_project',
  'Create a new project',
  {
    title: z.string().describe('Project title'),
    notes: z.string().optional().describe('Project notes'),
    area_id: z.string().optional().describe('Area to assign to'),
    tags: z.array(z.string()).optional().describe('Tags'),
  },
  async (args) => {
    const data = await api('/api/project', {
      method: 'POST',
      body: JSON.stringify(args),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'update_project',
  'Update an existing project',
  {
    id: z.string().describe('Project ID'),
    title: z.string().optional().describe('New title'),
    notes: z.string().optional().describe('New notes'),
    completed: z.boolean().optional().describe('Mark as completed'),
    canceled: z.boolean().optional().describe('Mark as canceled'),
  },
  async ({ id, completed, canceled, ...updates }) => {
    if (completed) {
      const data = await api(`/api/project/${id}/complete`, { method: 'POST' });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
    if (canceled) {
      (updates as any).status = 'canceled';
    }
    const data = await api(`/api/project/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tools: Search & Stats ───────────────────────────────────

server.tool(
  'search_todos',
  'Search tasks by title or notes',
  { query: z.string().describe('Search query') },
  async ({ query }) => {
    const data = await api(`/api/search?q=${encodeURIComponent(query)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.tasks, null, 2) }] };
  }
);

server.tool(
  'search_advanced',
  'Advanced search with filters',
  {
    query: z.string().describe('Search text'),
    tags: z.array(z.string()).optional().describe('Filter by tags'),
    completed: z.boolean().optional().describe('Include completed tasks'),
    canceled: z.boolean().optional().describe('Include canceled tasks'),
  },
  async ({ query }) => {
    // For now, routes through the same search endpoint
    const data = await api(`/api/search?q=${encodeURIComponent(query)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.tasks, null, 2) }] };
  }
);

server.tool(
  'get_logbook',
  'Get recently completed tasks',
  { days: z.number().optional().default(7).describe('Number of days to look back (default: 7)') },
  async ({ days }) => {
    const data = await api(`/api/logbook?days=${days}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.tasks, null, 2) }] };
  }
);

server.tool(
  'get_stats',
  'Get task counts: overdue, today, inbox, total open — useful for badge count and daily briefing',
  {},
  async () => {
    const data = await api('/api/stats');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'get_tags',
  'Get all tags with usage counts',
  {},
  async () => {
    const data = await api('/api/tags');
    return { content: [{ type: 'text', text: JSON.stringify(data.tags, null, 2) }] };
  }
);

server.tool(
  'get_tagged_items',
  'Get all tasks with a specific tag',
  { tag_name: z.string().describe('Tag name') },
  async ({ tag_name }) => {
    const data = await api(`/api/tagged/${encodeURIComponent(tag_name)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data.tasks, null, 2) }] };
  }
);

server.tool(
  'get_areas',
  'Get all areas with their projects',
  {},
  async () => {
    const data = await api('/api/areas');
    return { content: [{ type: 'text', text: JSON.stringify(data.areas, null, 2) }] };
  }
);

// ── Start Server ────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Raidō MCP server running on stdio');
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
