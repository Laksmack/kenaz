import express from 'express';
import type { GmailService } from './gmail';
import type { HubSpotService } from './hubspot';
import type { ViewStore, RuleStore } from './stores';
import type { View, Rule } from '../shared/types';

import type { CalendarService } from './calendar';

export function startApiServer(gmail: GmailService, hubspot: HubSpotService, port: number, viewStore?: ViewStore, ruleStore?: RuleStore, calendar?: CalendarService) {
  const app = express();
  app.use(express.json());

  // ── Gmail: Core ────────────────────────────────────────────

  app.get('/api/inbox', async (_req, res) => {
    try {
      const threads = await gmail.fetchThreads('in:inbox', 50);
      res.json({ threads });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/unread', async (_req, res) => {
    try {
      const threads = await gmail.fetchThreads('is:unread in:inbox', 50);
      res.json({ count: threads.length, threads });
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
      const threads = await gmail.fetchThreads(q, 50);
      res.json({ threads });
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

  // ── Gmail: Stats ───────────────────────────────────────────

  app.get('/api/stats', async (_req, res) => {
    try {
      const stats = await gmail.getStats();
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
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
        gmail.fetchThreads(`from:${email} OR to:${email}`, 5).catch(() => []),
      ]);

      const recentThreads = emailThreads.map((t) => ({
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
    res.json({ status: 'ok', app: 'kenaz', version: '0.1.0' });
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
