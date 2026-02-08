import express from 'express';
import type { GmailService } from './gmail';
import type { HubSpotService } from './hubspot';

export function startApiServer(gmail: GmailService, hubspot: HubSpotService, port: number) {
  const app = express();
  app.use(express.json());

  // ── Gmail Endpoints ──────────────────────────────────────

  app.get('/api/inbox', async (_req, res) => {
    try {
      const threads = await gmail.fetchThreads('in:inbox', 50);
      res.json({ threads });
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

  app.get('/api/search', async (req, res) => {
    try {
      const q = (req.query.q as string) || '';
      const threads = await gmail.fetchThreads(q, 50);
      res.json({ threads });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

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
      // For now, drafts are saved as sends with a flag
      // TODO: implement Gmail draft API
      res.json({ status: 'draft saved', payload: req.body });
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

  // ── HubSpot Endpoints ────────────────────────────────────

  app.get('/api/hubspot/contact/:email', async (req, res) => {
    try {
      const context = await hubspot.lookupContact(req.params.email);
      res.json(context);
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

  // ── Health ────────────────────────────────────────────────

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
