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

  // ── Someday ───────────────────────────────────────────────

  app.get('/api/someday', (_req, res) => {
    try {
      const tasks = store.getSomeday();
      res.json({ tasks });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Projects ──────────────────────────────────────────────

  app.get('/api/projects', (_req, res) => {
    try {
      const projects = store.getProjects();
      res.json({ projects });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/project/:id', (req, res) => {
    try {
      const project = store.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json(project);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/project', (req, res) => {
    try {
      const project = store.createProject(req.body);
      res.json(project);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/project/:id', (req, res) => {
    try {
      const project = store.updateProject(req.params.id, req.body);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json(project);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/project/:id/complete', (req, res) => {
    try {
      const project = store.completeProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json(project);
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

  // ── Areas ─────────────────────────────────────────────────

  app.get('/api/areas', (_req, res) => {
    try {
      const areas = store.getAreas();
      res.json({ areas });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
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
