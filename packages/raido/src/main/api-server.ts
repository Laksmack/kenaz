import express from 'express';
import type { TaskStore } from './task-store';

export function startApiServer(store: TaskStore, port: number) {
  const app = express();
  app.use(express.json());

  // ── Today ─────────────────────────────────────────────────

  app.get('/api/today', (_req, res) => {
    try {
      const tasks = store.getToday();
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

  app.get('/api/upcoming', (_req, res) => {
    try {
      const tasks = store.getUpcoming();
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
      const task = store.completeTask(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
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
        } catch {
          console.error(`[Raidō] Failed to pull attachment: ${att.filename}`);
        }
      }

      res.json({ attachments: results });
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
