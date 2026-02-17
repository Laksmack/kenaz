import express from 'express';
import archiver from 'archiver';
import type { GmailService } from './gmail';
import type { HubSpotService } from './hubspot';
import type { ViewStore, RuleStore } from './stores';
import type { View, Rule } from '../shared/types';

import type { CalendarService } from './calendar';
import type { ConfigStore } from './config';

export function startApiServer(gmail: GmailService, hubspot: HubSpotService, port: number, viewStore?: ViewStore, ruleStore?: RuleStore, calendar?: CalendarService, configStore?: ConfigStore) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // ── Gmail: Core ────────────────────────────────────────────

  app.get('/api/inbox', async (_req, res) => {
    try {
      const result = await gmail.fetchThreads('in:inbox', 50);
      res.json({ threads: result.threads });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/unread', async (_req, res) => {
    try {
      const result = await gmail.fetchThreads('is:unread in:inbox', 50);
      res.json({ count: result.threads.length, threads: result.threads });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/email/:id', async (req, res) => {
    try {
      const thread = await gmail.fetchThread(req.params.id);
      if (!thread) return res.status(404).json({ error: 'Thread not found' });
      res.json(thread);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/thread/:id/summary', async (req, res) => {
    try {
      const summary = await gmail.getThreadSummary(req.params.id);
      res.json(summary);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/search', async (req, res) => {
    try {
      const q = (req.query.q as string) || '';
      const result = await gmail.fetchThreads(q, 50);
      res.json({ threads: result.threads });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Gmail: Send & Draft ────────────────────────────────────

  app.post('/api/send', async (req, res) => {
    try {
      const result = await gmail.sendEmail(req.body);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/draft', async (req, res) => {
    try {
      const draftId = await gmail.createDraft(req.body);
      res.json({ draftId });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/drafts', async (_req, res) => {
    try {
      const drafts = await gmail.listDrafts();
      res.json({ drafts });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/draft/:id', async (req, res) => {
    try {
      const draft = await gmail.getDraft(req.params.id);
      res.json(draft);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/draft/:id', async (req, res) => {
    try {
      await gmail.deleteDraft(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Gmail: Labels & Actions ────────────────────────────────

  app.get('/api/labels', async (_req, res) => {
    try {
      const labels = await gmail.listLabels();
      res.json({ labels });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/label/:id', async (req, res) => {
    try {
      const { add, remove } = req.body;
      await gmail.modifyLabels(req.params.id, add || null, remove || null);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/archive/:id', async (req, res) => {
    try {
      await gmail.archiveThread(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/thread/:id', async (req, res) => {
    try {
      await gmail.trashThread(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/batch/archive', async (req, res) => {
    try {
      const { threadIds } = req.body;
      if (!Array.isArray(threadIds)) {
        return res.status(400).json({ error: 'threadIds must be an array' });
      }
      await Promise.all(threadIds.map((id: string) => gmail.archiveThread(id)));
      res.json({ success: true, archived: threadIds.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Gmail: Attachments ─────────────────────────────────────

  app.get('/api/attachment/:messageId/:attachmentId', async (req, res) => {
    try {
      const filename = (req.query.filename as string) || 'attachment';
      const buffer = await gmail.getAttachmentBuffer(req.params.messageId, req.params.attachmentId);

      // Infer content type from filename
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const mimeTypes: Record<string, string> = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        csv: 'text/csv',
        txt: 'text/plain',
        zip: 'application/zip',
      };

      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // List all attachments in a thread
  app.get('/api/thread/:threadId/attachments', async (req, res) => {
    try {
      const attachments = await gmail.listThreadAttachments(req.params.threadId);
      res.json({ attachments });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Download a single attachment (saves to Downloads folder, returns file path)
  app.post('/api/attachment/:messageId/:attachmentId/download', async (req, res) => {
    try {
      const filename = (req.query.filename as string) || 'attachment';
      const filePath = await gmail.downloadAttachment(
        req.params.messageId,
        req.params.attachmentId,
        filename
      );
      res.json({ success: true, path: filePath });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Download all attachments in a thread as a zip
  app.get('/api/thread/:threadId/attachments/download-all', async (req, res) => {
    try {
      const attachments = await gmail.listThreadAttachments(req.params.threadId);
      if (attachments.length === 0) {
        return res.status(404).json({ error: 'No attachments in this thread' });
      }

      const archive = archiver('zip', { zlib: { level: 5 } });
      const threadId = req.params.threadId;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="attachments-${threadId}.zip"`);

      archive.pipe(res);

      // Fetch each attachment and add to zip
      const seen = new Map<string, number>();
      for (const att of attachments) {
        const buffer = await gmail.getAttachmentBuffer(att.messageId, att.id);
        // Deduplicate filenames
        let name = att.filename;
        const count = seen.get(name) || 0;
        if (count > 0) {
          const ext = name.includes('.') ? '.' + name.split('.').pop() : '';
          const base = ext ? name.slice(0, -ext.length) : name;
          name = `${base} (${count})${ext}`;
        }
        seen.set(att.filename, count + 1);
        archive.append(buffer, { name });
      }

      await archive.finalize();
    } catch (e: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // ── Gmail: Stats ───────────────────────────────────────────

  app.get('/api/stats', async (_req, res) => {
    try {
      const stats = await gmail.getStats();
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Config (read-only, for cross-app integration) ─────────

  app.get('/api/config', (_req, res) => {
    if (!configStore) return res.status(503).json({ error: 'Config not available' });
    const cfg = configStore.get();
    res.json({
      archiveOnReply: cfg.archiveOnReply,
    });
  });

  // ── HubSpot Endpoints ─────────────────────────────────────

  app.get('/api/hubspot/contact/:email', async (req, res) => {
    try {
      const context = await hubspot.lookupContact(req.params.email);
      res.json(context);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/hubspot/deals', async (req, res) => {
    try {
      const stage = req.query.stage as string | undefined;
      const owner = req.query.owner as string | undefined;
      const deals = await hubspot.listActiveDeals(stage, owner);
      res.json({ deals });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/hubspot/recent/:email', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const result = await hubspot.getRecentActivities(req.params.email, limit);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/hubspot/log', async (req, res) => {
    try {
      await hubspot.logEmail(req.body, req.body.gmail_message_id || '');
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Combined Context (THE KILLER ENDPOINT) ─────────────────

  app.get('/api/context/:email', async (req, res) => {
    try {
      const email = req.params.email;

      // Run Gmail search and HubSpot lookup in parallel
      const [hubspotContext, emailThreads] = await Promise.all([
        hubspot.lookupContact(email).catch(() => ({ contact: null, deals: [], activities: [], loading: false, error: null })),
        gmail.fetchThreads(`from:${email} OR to:${email}`, 5).catch(() => ({ threads: [], nextPageToken: undefined })),
      ]);

      const recentThreads = emailThreads.threads.map((t) => ({
        threadId: t.id,
        subject: t.subject,
        lastDate: t.lastDate,
        messageCount: t.messages.length,
        latestSnippet: t.snippet,
        participants: t.participants.map((p) => ({ name: p.name, email: p.email })),
      }));

      res.json({
        contact: hubspotContext.contact ? {
          name: `${hubspotContext.contact.firstName} ${hubspotContext.contact.lastName}`.trim(),
          email: hubspotContext.contact.email,
          title: hubspotContext.contact.title,
          company: hubspotContext.contact.company,
          phone: hubspotContext.contact.phone,
        } : null,
        deals: hubspotContext.deals,
        recentActivities: hubspotContext.activities.map((a) => ({
          type: a.type,
          date: a.timestamp,
          subject: a.subject || undefined,
          body: a.body || undefined,
        })),
        recentThreads,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Views CRUD ──────────────────────────────────────────────

  if (viewStore) {
    app.get('/api/views', (_req, res) => {
      res.json({ views: viewStore.list() });
    });

    app.post('/api/views', (req, res) => {
      const view: View = req.body;
      if (!view.id || !view.name) {
        return res.status(400).json({ error: 'id and name are required' });
      }
      const views = viewStore.create(view);
      res.json({ views });
    });

    app.put('/api/views/:id', (req, res) => {
      const views = viewStore.update(req.params.id, req.body);
      res.json({ views });
    });

    app.delete('/api/views/:id', (req, res) => {
      const views = viewStore.remove(req.params.id);
      res.json({ views });
    });
  }

  // ── Rules CRUD ─────────────────────────────────────────────

  if (ruleStore) {
    app.get('/api/rules', (_req, res) => {
      res.json({ rules: ruleStore.list() });
    });

    app.post('/api/rules', (req, res) => {
      const rule: Rule = req.body;
      if (!rule.id || !rule.name) {
        return res.status(400).json({ error: 'id and name are required' });
      }
      const rules = ruleStore.create(rule);
      res.json({ rules });
    });

    app.put('/api/rules/:id', (req, res) => {
      const rules = ruleStore.update(req.params.id, req.body);
      res.json({ rules });
    });

    app.delete('/api/rules/:id', (req, res) => {
      const rules = ruleStore.remove(req.params.id);
      res.json({ rules });
    });
  }

  // ── Calendar ───────────────────────────────────────────────

  if (calendar) {
    app.post('/api/calendar/rsvp/:eventId', async (req, res) => {
      try {
        const { eventId } = req.params;
        const { response, calendarId } = req.body as { response: 'accepted' | 'tentative' | 'declined'; calendarId?: string };
        if (!response || !['accepted', 'tentative', 'declined'].includes(response)) {
          return res.status(400).json({ error: 'response must be accepted, tentative, or declined' });
        }
        const result = await calendar.rsvpEvent(eventId, response, calendarId || 'primary');
        res.json(result);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    app.get('/api/calendar/events', async (req, res) => {
      try {
        const timeMin = (req.query.timeMin as string) || new Date().toISOString();
        const timeMax = (req.query.timeMax as string) || new Date(Date.now() + 86400000).toISOString();
        const events = await calendar.getEventsInRange(timeMin, timeMax);
        res.json({ events });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });
  }

  // ── Health ─────────────────────────────────────────────────

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'kenaz' });
  });

  // ── OpenAPI Spec ──────────────────────────────────────────

  app.get('/openapi.json', (_req, res) => {
    res.json({
      openapi: '3.0.3',
      info: {
        title: 'Kenaz API',
        description: 'Local API for the Kenaz email client. Provides access to Gmail, HubSpot CRM, Google Calendar, and client configuration (views/rules).',
        version: '0.4.2',
        contact: { name: 'Kenaz' },
      },
      servers: [{ url: `http://localhost:${port}`, description: 'Local Kenaz instance' }],
      paths: {
        '/api/health': {
          get: { summary: 'Health check', operationId: 'health', tags: ['System'], responses: { '200': { description: 'Server status', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' }, app: { type: 'string' } } } } } } } },
        },
        '/api/inbox': {
          get: { summary: 'List inbox threads', operationId: 'getInbox', tags: ['Gmail'], responses: { '200': { description: 'Inbox threads', content: { 'application/json': { schema: { type: 'object', properties: { threads: { type: 'array', items: { $ref: '#/components/schemas/Thread' } } } } } } } } },
        },
        '/api/unread': {
          get: { summary: 'Unread inbox threads with count', operationId: 'getUnread', tags: ['Gmail'], responses: { '200': { description: 'Unread threads', content: { 'application/json': { schema: { type: 'object', properties: { count: { type: 'integer' }, threads: { type: 'array', items: { $ref: '#/components/schemas/Thread' } } } } } } } } },
        },
        '/api/email/{id}': {
          get: { summary: 'Get full thread by ID', operationId: 'getThread', tags: ['Gmail'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Full thread with messages' }, '404': { description: 'Thread not found' } } },
        },
        '/api/thread/{id}/summary': {
          get: { summary: 'AI-ready thread summary (timeline, participants, latest message)', operationId: 'getThreadSummary', tags: ['Gmail'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Thread summary' } } },
        },
        '/api/search': {
          get: { summary: 'Search threads using Gmail query syntax', operationId: 'searchThreads', tags: ['Gmail'], parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Gmail search query (e.g. "from:user@example.com", "subject:invoice", "is:unread")' }], responses: { '200': { description: 'Matching threads' } } },
        },
        '/api/send': {
          post: { summary: 'Send an email', operationId: 'sendEmail', tags: ['Gmail'], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SendEmailPayload' } } } }, responses: { '200': { description: 'Sent message ID and thread ID' } } },
        },
        '/api/draft': {
          post: { summary: 'Create a draft', operationId: 'createDraft', tags: ['Gmail'], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SendEmailPayload' } } } }, responses: { '200': { description: 'Draft ID' } } },
        },
        '/api/drafts': {
          get: { summary: 'List drafts', operationId: 'listDrafts', tags: ['Gmail'], responses: { '200': { description: 'List of drafts' } } },
        },
        '/api/draft/{id}': {
          get: { summary: 'Get draft by ID', operationId: 'getDraft', tags: ['Gmail'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Draft content' } } },
          delete: { summary: 'Delete a draft', operationId: 'deleteDraft', tags: ['Gmail'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Success' } } },
        },
        '/api/labels': {
          get: { summary: 'List all Gmail labels', operationId: 'listLabels', tags: ['Gmail'], responses: { '200': { description: 'Label list with IDs, names, and types' } } },
        },
        '/api/label/{id}': {
          post: { summary: 'Add/remove labels on a thread', operationId: 'modifyLabels', tags: ['Gmail'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Thread ID' }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { add: { type: 'string', description: 'Label name to add' }, remove: { type: 'string', description: 'Label name to remove' } } } } } }, responses: { '200': { description: 'Success' } } },
        },
        '/api/archive/{id}': {
          post: { summary: 'Archive a thread (remove from inbox)', operationId: 'archiveThread', tags: ['Gmail'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Success' } } },
        },
        '/api/thread/{id}': {
          delete: { summary: 'Trash a thread', operationId: 'trashThread', tags: ['Gmail'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Success' } } },
        },
        '/api/batch/archive': {
          post: { summary: 'Archive multiple threads at once', operationId: 'batchArchive', tags: ['Gmail'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { threadIds: { type: 'array', items: { type: 'string' } } }, required: ['threadIds'] } } } }, responses: { '200': { description: 'Success with count' } } },
        },
        '/api/attachment/{messageId}/{attachmentId}': {
          get: { summary: 'Download an attachment', operationId: 'getAttachment', tags: ['Gmail'], parameters: [{ name: 'messageId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'filename', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Binary file download' } } },
        },
        '/api/stats': {
          get: { summary: 'Inbox statistics (counts for inbox, unread, pending, todo, starred)', operationId: 'getStats', tags: ['Gmail'], responses: { '200': { description: 'Count object' } } },
        },
        '/api/hubspot/contact/{email}': {
          get: { summary: 'Look up HubSpot contact by email', operationId: 'getHubspotContact', tags: ['HubSpot'], parameters: [{ name: 'email', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Contact, deals, activities' } } },
        },
        '/api/hubspot/deals': {
          get: { summary: 'List active HubSpot deals', operationId: 'getHubspotDeals', tags: ['HubSpot'], parameters: [{ name: 'stage', in: 'query', schema: { type: 'string' } }, { name: 'owner', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Deal list' } } },
        },
        '/api/hubspot/recent/{email}': {
          get: { summary: 'Recent HubSpot activities for a contact', operationId: 'getHubspotRecent', tags: ['HubSpot'], parameters: [{ name: 'email', in: 'path', required: true, schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }], responses: { '200': { description: 'Recent activities' } } },
        },
        '/api/hubspot/log': {
          post: { summary: 'Log an email to HubSpot', operationId: 'logToHubspot', tags: ['HubSpot'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '200': { description: 'Success' } } },
        },
        '/api/context/{email}': {
          get: { summary: 'Combined context: HubSpot contact + deals + activities + recent email threads', operationId: 'getContext', tags: ['Combined'], parameters: [{ name: 'email', in: 'path', required: true, schema: { type: 'string', format: 'email' } }], responses: { '200': { description: 'Full context for a contact' } } },
        },
        '/api/views': {
          get: { summary: 'List custom email views', operationId: 'listViews', tags: ['Views & Rules'], responses: { '200': { description: 'View list' } } },
          post: { summary: 'Create a custom view', operationId: 'createView', tags: ['Views & Rules'], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/View' } } } }, responses: { '200': { description: 'Updated view list' } } },
        },
        '/api/views/{id}': {
          put: { summary: 'Update a view', operationId: 'updateView', tags: ['Views & Rules'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/View' } } } }, responses: { '200': { description: 'Updated view list' } } },
          delete: { summary: 'Delete a view', operationId: 'deleteView', tags: ['Views & Rules'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Updated view list' } } },
        },
        '/api/rules': {
          get: { summary: 'List automation rules', operationId: 'listRules', tags: ['Views & Rules'], responses: { '200': { description: 'Rule list' } } },
          post: { summary: 'Create a rule', operationId: 'createRule', tags: ['Views & Rules'], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Rule' } } } }, responses: { '200': { description: 'Updated rule list' } } },
        },
        '/api/rules/{id}': {
          put: { summary: 'Update a rule', operationId: 'updateRule', tags: ['Views & Rules'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Rule' } } } }, responses: { '200': { description: 'Updated rule list' } } },
          delete: { summary: 'Delete a rule', operationId: 'deleteRule', tags: ['Views & Rules'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Updated rule list' } } },
        },
        '/api/calendar/events': {
          get: { summary: 'List calendar events in a time range', operationId: 'listEvents', tags: ['Calendar'], parameters: [{ name: 'timeMin', in: 'query', schema: { type: 'string', format: 'date-time' } }, { name: 'timeMax', in: 'query', schema: { type: 'string', format: 'date-time' } }], responses: { '200': { description: 'Event list' } } },
        },
        '/api/calendar/rsvp/{eventId}': {
          post: { summary: 'RSVP to a calendar event', operationId: 'rsvpEvent', tags: ['Calendar'], parameters: [{ name: 'eventId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { response: { type: 'string', enum: ['accepted', 'tentative', 'declined'] }, calendarId: { type: 'string', default: 'primary' } }, required: ['response'] } } } }, responses: { '200': { description: 'Updated event' } } },
        },
      },
      components: {
        schemas: {
          Thread: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              subject: { type: 'string' },
              snippet: { type: 'string' },
              lastDate: { type: 'string', format: 'date-time' },
              labels: { type: 'array', items: { type: 'string' } },
              isUnread: { type: 'boolean' },
              from: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' } } },
              messages: { type: 'array', items: { $ref: '#/components/schemas/Message' } },
            },
          },
          Message: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              from: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' } } },
              to: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' } } } },
              cc: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' } } } },
              subject: { type: 'string' },
              snippet: { type: 'string' },
              body: { type: 'string', description: 'HTML body' },
              bodyText: { type: 'string', description: 'Plain text body' },
              date: { type: 'string', format: 'date-time' },
              labels: { type: 'array', items: { type: 'string' } },
              isUnread: { type: 'boolean' },
              hasAttachments: { type: 'boolean' },
              attachments: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, filename: { type: 'string' }, mimeType: { type: 'string' }, size: { type: 'integer' } } } },
            },
          },
          SendEmailPayload: {
            type: 'object',
            required: ['to', 'subject', 'body_markdown'],
            properties: {
              to: { type: 'string', description: 'Comma-separated recipient emails' },
              cc: { type: 'string' },
              bcc: { type: 'string' },
              subject: { type: 'string' },
              body_markdown: { type: 'string', description: 'Email body in markdown (converted to HTML)' },
              reply_to_thread_id: { type: 'string' },
              reply_to_message_id: { type: 'string' },
              signature: { type: 'boolean', default: true },
              skip_auto_bcc: { type: 'boolean' },
            },
          },
          View: {
            type: 'object',
            required: ['id', 'name', 'query'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              icon: { type: 'string' },
              query: { type: 'string', description: 'Gmail search query (e.g. "in:inbox", "label:PENDING")' },
              shortcut: { type: 'string' },
              color: { type: 'string' },
            },
          },
          Rule: {
            type: 'object',
            required: ['id', 'name', 'conditions', 'actions'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              enabled: { type: 'boolean' },
              conditions: { type: 'array', items: { type: 'object', properties: { field: { type: 'string', enum: ['sender', 'to', 'cc', 'subject', 'body', 'has_attachment', 'label'] }, operator: { type: 'string', enum: ['contains', 'not_contains', 'equals', 'matches'] }, value: { type: 'string' } } } },
              actions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['add_label', 'remove_label', 'archive', 'mark_read'] }, label: { type: 'string' } } } },
            },
          },
        },
      },
    });
  });

  // ── Root discovery ────────────────────────────────────────

  app.get('/', (_req, res) => {
    res.json({
      name: 'Kenaz API',
      docs: `http://localhost:${port}/openapi.json`,
      health: `http://localhost:${port}/api/health`,
    });
  });

  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`Kenaz API running on http://localhost:${port}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use, trying ${port + 1}...`);
      app.listen(port + 1, '127.0.0.1', () => {
        console.log(`Kenaz API running on http://localhost:${port + 1}`);
      });
    } else {
      console.error('API server error:', err);
    }
  });
}
