import express from 'express';
import type { TaskStore } from './task-store';
import type { ConfigStore } from './config';

export function startApiServer(store: TaskStore, port: number, configStore?: ConfigStore) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // ── Today ─────────────────────────────────────────────────

  app.get('/api/today', (req, res) => {
    try {
      const includeDeferred = req.query.include_deferred === 'true';
      const tasks = store.getToday(includeDeferred);
      res.json({ tasks });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Inbox ─────────────────────────────────────────────────

  app.get('/api/inbox', (_req, res) => {
    try {
      const tasks = store.getInbox();
      res.json({ tasks });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Upcoming ──────────────────────────────────────────────

  app.get('/api/upcoming', (req, res) => {
    try {
      const includeDeferred = req.query.include_deferred === 'true';
      const tasks = store.getUpcoming(includeDeferred);
      res.json({ tasks });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Deferred ───────────────────────────────────────────────

  app.get('/api/deferred', (_req, res) => {
    try {
      const tasks = store.getDeferred();
      res.json({ tasks });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Groups (bracket prefix) ───────────────────────────────

  app.get('/api/groups', (_req, res) => {
    try {
      const groups = store.getGroups();
      res.json({ groups });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/group/:name', (req, res) => {
    try {
      const tasks = store.getGroup(req.params.name);
      res.json({ tasks });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Tasks ─────────────────────────────────────────────────

  app.get('/api/task/:id', (req, res) => {
    try {
      const task = store.getTask(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/task', (req, res) => {
    try {
      const task = store.createTask(req.body);
      res.json(task);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/task/:id', (req, res) => {
    try {
      const task = store.updateTask(req.params.id, req.body);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/task/:id', (req, res) => {
    try {
      store.deleteTask(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/task/:id/complete', (req, res) => {
    try {
      const result = store.completeTask(req.params.id);
      if (!result.task) return res.status(404).json({ error: 'Task not found' });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Search ────────────────────────────────────────────────

  app.get('/api/search', (req, res) => {
    try {
      const q = (req.query.q as string) || '';
      const tasks = store.searchTasks(q);
      res.json({ tasks });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Logbook ───────────────────────────────────────────────

  app.get('/api/logbook', (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const tasks = store.getLogbook(days);
      res.json({ tasks });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Tags ──────────────────────────────────────────────────

  app.get('/api/tags', (_req, res) => {
    try {
      const tags = store.getTags();
      res.json({ tags });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/tagged/:tag', (req, res) => {
    try {
      const tasks = store.getTaggedTasks(req.params.tag);
      res.json({ tasks });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Stats ─────────────────────────────────────────────────

  app.get('/api/stats', (_req, res) => {
    try {
      const stats = store.getStats();
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Checklist Items ──────────────────────────────────────────

  app.get('/api/task/:id/checklist', (req, res) => {
    try {
      const items = store.getChecklistItems(req.params.id);
      res.json({ items });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/task/:id/checklist', (req, res) => {
    try {
      const { title } = req.body;
      if (!title) return res.status(400).json({ error: 'title required' });
      const item = store.addChecklistItem(req.params.id, title);
      res.json(item);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/checklist/:id', (req, res) => {
    try {
      const item = store.updateChecklistItem(req.params.id, req.body);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      res.json(item);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/checklist/:id', (req, res) => {
    try {
      const ok = store.deleteChecklistItem(req.params.id);
      res.json({ success: ok });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Attachments ─────────────────────────────────────────────

  app.get('/api/task/:id/attachments', (req, res) => {
    try {
      const attachments = store.getAttachments(req.params.id);
      res.json({ attachments });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/task/:id/attachment/:attachmentId', (req, res) => {
    try {
      const filePath = store.getAttachmentPath(req.params.id, req.params.attachmentId);
      if (!filePath) return res.status(404).json({ error: 'Attachment not found' });
      res.sendFile(filePath);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/task/:id/attachment/:attachmentId', (req, res) => {
    try {
      const ok = store.deleteAttachment(req.params.id, req.params.attachmentId);
      res.json({ success: ok });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/task/:id/attachment', (req, res) => {
    try {
      const { filename, data } = req.body;
      if (!filename || !data) return res.status(400).json({ error: 'filename and data (base64) required' });
      const buffer = Buffer.from(data, 'base64');
      const att = store.addAttachment(req.params.id, filename, buffer, { source: 'upload' });
      res.json({ attachment: att });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/task/:id/attachments/pull-email', async (req, res) => {
    try {
      const { threadId } = req.body;
      if (!threadId) return res.status(400).json({ error: 'threadId required' });

      const KENAZ_PORT = 3141;
      const listRes = await fetch(`http://localhost:${KENAZ_PORT}/api/thread/${threadId}/attachments`);
      if (!listRes.ok) return res.json({ attachments: [], note: 'Could not reach Kenaz' });

      const { attachments: emailAtts } = await listRes.json() as {
        attachments: { id: string; messageId: string; filename: string; mimeType: string; size: number }[]
      };
      if (!emailAtts || emailAtts.length === 0) return res.json({ attachments: [] });

      const results = [];
      for (const att of emailAtts) {
        try {
          const bufRes = await fetch(
            `http://localhost:${KENAZ_PORT}/api/attachment/${att.messageId}/${att.id}?filename=${encodeURIComponent(att.filename)}`
          );
          if (!bufRes.ok) continue;
          const arrayBuf = await bufRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          const saved = store.addAttachment(req.params.id, att.filename, buffer, {
            mimeType: att.mimeType,
            source: 'email',
            sourceRef: `kenaz:${threadId}:${att.messageId}:${att.id}`,
          });
          results.push(saved);
        } catch (e) {
          console.error(`[Raidō] Failed to pull attachment: ${att.filename}`, e);
        }
      }

      res.json({ attachments: results });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Suggest Next Action ────────────────────────────────────

  let suggestCache: { result: any; timestamp: number } | null = null;
  const SUGGEST_CACHE_MS = 30 * 60 * 1000;

  app.get('/api/suggest-next', async (_req, res) => {
    try {
      if (suggestCache && Date.now() - suggestCache.timestamp < SUGGEST_CACHE_MS) {
        return res.json(suggestCache.result);
      }

      const tasks = store.getToday();
      let events: any[] = [];
      let deals: any[] = [];

      try {
        const dagaz = await fetch('http://localhost:3143/api/today', { signal: AbortSignal.timeout(3000) });
        if (dagaz.ok) { const d = await dagaz.json(); events = d.events || []; }
      } catch { /* Dagaz not available */ }

      try {
        const cfg = configStore?.get();
        const hsParams = new URLSearchParams();
        if (cfg?.hubspot_owner_id) hsParams.set('owner', cfg.hubspot_owner_id);
        if (cfg?.hubspot_pipeline) hsParams.set('pipeline', cfg.hubspot_pipeline);
        const hsQs = hsParams.toString() ? `?${hsParams.toString()}` : '';
        const hs = await fetch(`http://localhost:3141/api/hubspot/deals${hsQs}`, { signal: AbortSignal.timeout(3000) });
        if (hs.ok) { const d = await hs.json(); deals = (d.deals || []).slice(0, 5); }
      } catch { /* Kenaz not available */ }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return res.json({ action: 'Configure ANTHROPIC_API_KEY to enable suggestions', rationale: '', source: 'task' });
      }

      const context = [
        `Today's tasks (${tasks.length}):`,
        ...tasks.slice(0, 10).map(t => `- [${t.due_date}] ${t.title} (priority ${t.priority})`),
        '',
        `Today's calendar events (${events.length}):`,
        ...events.slice(0, 8).map((e: any) => `- ${e.start_time ? new Date(e.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'All day'}: ${e.summary}`),
        '',
        `Top deals needing attention (${deals.length}):`,
        ...deals.map((d: any) => `- ${d.name} (${d.stage}) — last activity: ${d.lastActivityDate || 'unknown'}`),
      ].join('\n');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `You are a productivity assistant. Given the user's current day context, suggest exactly ONE specific, actionable next step. Reply as JSON: {"action":"<max 20 words>","rationale":"<1 paragraph>","source":"task"|"email"|"deal"|"calendar"}\n\nContext:\n${context}`,
          }],
        }),
      });

      if (!response.ok) {
        return res.json({ action: 'Review your overdue tasks', rationale: 'Could not reach AI suggestion service.', source: 'task' });
      }

      const body = await response.json();
      const text = body.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { action: text.slice(0, 80), rationale: '', source: 'task' };

      suggestCache = { result, timestamp: Date.now() };
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Health ─────────────────────────────────────────────────

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'raido' });
  });

  // ── Start Server ──────────────────────────────────────────

  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`Raidō API running on http://localhost:${port}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      server.close();
      app.listen(port + 1, '127.0.0.1', () => {
        console.log(`Raidō API running on http://localhost:${port + 1}`);
      });
    }
  });

  return server;
}
