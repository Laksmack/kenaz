import express from 'express';
import type { VaultStore } from './vault-store';

export function startApiServer(store: VaultStore, port: number) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // ── Search ─────────────────────────────────────────────────

  app.get('/api/search', (req, res) => {
    try {
      const q = (req.query.q as string) || '';
      const type = req.query.type as string | undefined;
      const company = req.query.company as string | undefined;
      const since = req.query.since as string | undefined;
      const tags = req.query.tags ? (req.query.tags as string).split(',') : undefined;
      const notes = store.search(q, { type, company, since, tags });
      res.json({ notes });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Get Note ───────────────────────────────────────────────

  app.get('/api/note', (req, res) => {
    try {
      const notePath = req.query.path as string;
      if (!notePath) return res.status(400).json({ error: 'path is required' });
      const note = store.getNote(notePath);
      if (!note) return res.status(404).json({ error: 'Note not found' });
      res.json(note);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Meetings ───────────────────────────────────────────────

  app.get('/api/meetings', (req, res) => {
    try {
      const company = req.query.company as string;
      if (!company) return res.status(400).json({ error: 'company is required' });
      const since = req.query.since as string | undefined;
      const notes = store.getMeetings(company, since);
      res.json({ notes });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Account ────────────────────────────────────────────────

  app.get('/api/account', (req, res) => {
    try {
      const folderPath = req.query.path as string;
      if (!folderPath) return res.status(400).json({ error: 'path is required' });
      const notes = store.getAccount(folderPath);
      res.json({ notes });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Subfolders ──────────────────────────────────────────────

  app.get('/api/subfolders', (req, res) => {
    try {
      const parentPath = req.query.path as string;
      if (!parentPath) return res.status(400).json({ error: 'path is required' });
      const subfolders = store.getSubfolders(parentPath);
      res.json({ subfolders });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Folder Notes ────────────────────────────────────────────

  app.get('/api/folder', (req, res) => {
    try {
      const folderPath = req.query.path as string;
      if (!folderPath) return res.status(400).json({ error: 'path is required' });
      const notes = store.getFolderNotes(folderPath);
      res.json({ notes });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Unprocessed ────────────────────────────────────────────

  app.get('/api/unprocessed', (req, res) => {
    try {
      const since = req.query.since as string | undefined;
      const notes = store.getUnprocessed(since);
      res.json({ notes });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Companies ──────────────────────────────────────────────

  app.get('/api/companies', (_req, res) => {
    try {
      const companies = store.getCompanies();
      res.json({ companies });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Recent ────────────────────────────────────────────────

  app.get('/api/recent', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const notes = store.getRecent(limit);
      res.json({ notes });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Write Note ─────────────────────────────────────────────

  app.post('/api/note', (req, res) => {
    try {
      const { path: notePath, content } = req.body;
      if (!notePath || content == null) {
        return res.status(400).json({ error: 'path and content are required' });
      }
      store.writeNote(notePath, content);
      const note = store.getNote(notePath);
      res.json(note);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Health ─────────────────────────────────────────────────

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'laguz' });
  });

  // ── Start Server ──────────────────────────────────────────

  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`[Laguz] API running on http://localhost:${port}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Laguz] Port ${port} in use, trying ${port + 1}...`);
      server.close();
      app.listen(port + 1, '127.0.0.1', () => {
        console.log(`[Laguz] API running on http://localhost:${port + 1}`);
      });
    }
  });

  return server;
}
