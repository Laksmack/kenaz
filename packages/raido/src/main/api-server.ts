import express from 'express';
import type { TaskStore } from './task-store';
import type { ConfigStore } from './config';
import type { Task } from '../shared/types';

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
  const SUGGEST_CACHE_MS = 10 * 60 * 1000;

  app.get('/api/suggest-next', async (_req, res) => {
    try {
      if (suggestCache && Date.now() - suggestCache.timestamp < SUGGEST_CACHE_MS) {
        return res.json(suggestCache.result);
      }

      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const tasks = store.getToday();
      let events: any[] = [];
      let deals: any[] = [];

      try {
        const dagaz = await fetch('http://localhost:3143/api/today', { signal: AbortSignal.timeout(3000) });
        if (dagaz.ok) { const d = await dagaz.json() as any; events = d.events || []; }
      } catch { /* Dagaz not available */ }

      try {
        const cfg = configStore?.get();
        if (cfg?.hubspot_enabled) {
          const hsParams = new URLSearchParams();
          if (cfg.hubspot_owner_id) hsParams.set('owner', cfg.hubspot_owner_id);
          if (cfg.hubspot_pipelines?.length) hsParams.set('pipeline', cfg.hubspot_pipelines.join(','));
          if (cfg.hubspot_excluded_stages?.length) hsParams.set('exclude_stages', cfg.hubspot_excluded_stages.join(','));
          const hsQs = hsParams.toString() ? `?${hsParams.toString()}` : '';
          const hs = await fetch(`http://localhost:3141/api/hubspot/deals${hsQs}`, { signal: AbortSignal.timeout(3000) });
          if (hs.ok) { const d = await hs.json() as any; deals = (d.deals || []); }
        }
      } catch { /* Kenaz not available */ }

      const result = suggestFromHeuristics(now, todayStr, tasks, events, deals);
      suggestCache = { result, timestamp: Date.now() };
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  function suggestFromHeuristics(
    now: Date,
    todayStr: string,
    tasks: Task[],
    events: any[],
    deals: any[],
  ): { action: string; rationale: string; source: string; task_id?: string; event_id?: string; deal_id?: string } {
    const nowMs = now.getTime();

    // 1. Upcoming meeting within 30 min → prep reminder
    const soonEvents = events
      .filter((e: any) => e.start_time)
      .map((e: any) => ({ ...e, _startMs: new Date(e.start_time).getTime() }))
      .filter((e: any) => e._startMs > nowMs && e._startMs - nowMs <= 30 * 60 * 1000)
      .sort((a: any, b: any) => a._startMs - b._startMs);

    if (soonEvents.length > 0) {
      const ev = soonEvents[0];
      const mins = Math.round((ev._startMs - nowMs) / 60000);
      return {
        action: `Prepare for "${ev.summary}" starting in ${mins} min`,
        rationale: `You have a meeting coming up shortly. Review the agenda and any prep materials now so you're ready.`,
        source: 'calendar',
        event_id: ev.id,
      };
    }

    // 2. Overdue high-priority tasks
    const overdue = tasks
      .filter(t => t.due_date && t.due_date < todayStr)
      .sort((a, b) => b.priority - a.priority || (a.due_date! < b.due_date! ? -1 : 1));

    if (overdue.length > 0) {
      const t = overdue[0];
      const daysOverdue = Math.floor((now.getTime() - new Date(t.due_date + 'T12:00:00').getTime()) / 86400000);
      return {
        action: `Handle overdue: "${t.title}"`,
        rationale: `This task is ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue${t.priority >= 2 ? ' and high priority' : ''}. ${overdue.length > 1 ? `You have ${overdue.length} overdue tasks total.` : ''}`,
        source: 'task',
        task_id: t.id,
      };
    }

    // 3. Stale HubSpot deals (no activity in 7+ days, excluding early-stage)
    const earlyStages = ['prospecting', 'outreach', 'qualification'];
    const staleDeals = deals
      .filter((d: any) => {
        if (earlyStages.some(s => (d.stage || '').toLowerCase().includes(s))) return false;
        if (!d.lastActivityDate) return true;
        const daysSince = Math.floor((nowMs - new Date(d.lastActivityDate).getTime()) / 86400000);
        return daysSince >= 7;
      })
      .map((d: any) => {
        const daysSince = d.lastActivityDate
          ? Math.floor((nowMs - new Date(d.lastActivityDate).getTime()) / 86400000)
          : 999;
        return { ...d, _daysSince: daysSince };
      })
      .sort((a: any, b: any) => b._daysSince - a._daysSince);

    if (staleDeals.length > 0) {
      const d = staleDeals[0];
      return {
        action: `Follow up on deal: "${d.name}"`,
        rationale: `This ${d.stage || 'active'} deal hasn't had activity in ${d._daysSince} days and risks going cold. ${staleDeals.length > 1 ? `${staleDeals.length} deals total need attention.` : ''}`,
        source: 'deal',
        deal_id: d.id || d.dealId,
      };
    }

    // 4. Highest-priority task due today
    const dueToday = tasks
      .filter(t => t.due_date === todayStr)
      .sort((a, b) => b.priority - a.priority || a.sort_order - b.sort_order);

    if (dueToday.length > 0) {
      const t = dueToday[0];
      const priorityLabel = t.priority >= 3 ? 'high priority ' : t.priority >= 2 ? 'medium priority ' : '';
      return {
        action: `Work on: "${t.title}"`,
        rationale: `This is your top ${priorityLabel}task for today. ${dueToday.length > 1 ? `${dueToday.length} tasks due today total.` : ''}`,
        source: 'task',
        task_id: t.id,
      };
    }

    // 5. Any remaining tasks (due today or earlier, already sorted by getToday)
    if (tasks.length > 0) {
      const t = tasks[0];
      return {
        action: `Work on: "${t.title}"`,
        rationale: `This is next on your list. You have ${tasks.length} task${tasks.length !== 1 ? 's' : ''} on your plate today.`,
        source: 'task',
        task_id: t.id,
      };
    }

    // 6. Upcoming event today to keep in mind
    const laterEvents = events
      .filter((e: any) => e.start_time && new Date(e.start_time).getTime() > nowMs)
      .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    if (laterEvents.length > 0) {
      const ev = laterEvents[0];
      const time = new Date(ev.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return {
        action: `Next up: "${ev.summary}" at ${time}`,
        rationale: `No tasks due today. Your next calendar event is at ${time}.`,
        source: 'calendar',
        event_id: ev.id,
      };
    }

    // 7. Clear day
    return {
      action: 'All clear — no tasks or events pending',
      rationale: 'No tasks due, no overdue items, and no upcoming events. Great time to tackle inbox items or plan ahead.',
      source: 'task',
    };
  }

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
