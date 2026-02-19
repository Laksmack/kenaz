/**
 * Cross-app communication helpers for Futhark apps.
 *
 * Each function builds the HTTP request and delegates to the app's
 * crossAppFetch IPC bridge (main process does the actual fetch).
 */

const PORTS = {
  kenaz: 3141,
  raido: 3142,
  dagaz: 3143,
  laguz: 3144,
} as const;

type AppName = keyof typeof PORTS;
type Fetcher = (url: string, options?: any) => Promise<any>;

function url(app: AppName, path: string): string {
  return `http://localhost:${PORTS[app]}${path}`;
}

// ── Email → other apps ──────────────────────────────────────

export interface EmailContext {
  threadId: string;
  subject: string;
  snippet: string;
  from: { name: string; email: string };
  participants: { name: string; email: string }[];
  lastDate: string;
  hasAttachments?: boolean;
}

export interface CreateTodoOptions {
  dueDate?: string | null;
  pullAttachments?: boolean;
}

export async function createTodoFromEmail(fetch: Fetcher, email: EmailContext, options?: CreateTodoOptions) {
  const task = await fetch(url('raido', '/api/task'), {
    method: 'POST',
    body: JSON.stringify({
      title: email.subject,
      notes: `From: ${email.from.name || email.from.email}\nDate: ${new Date(email.lastDate).toLocaleDateString()}\n\n${email.snippet}`,
      kenaz_thread_id: email.threadId,
      due_date: options?.dueDate || null,
    }),
  });

  if (options?.pullAttachments && task?.id) {
    try {
      await fetch(url('raido', `/api/task/${task.id}/attachments/pull-email`), {
        method: 'POST',
        body: JSON.stringify({ threadId: email.threadId }),
      });
    } catch {
      // Attachment pull is best-effort; the todo itself was created successfully
    }
  }

  return task;
}

export async function createNoteFromEmail(fetch: Fetcher, email: EmailContext) {
  const date = new Date(email.lastDate).toISOString().slice(0, 10);
  const safeName = email.subject.replace(/[/\\:*?"<>|]/g, '-').slice(0, 80);
  const path = `meetings/${date} - ${safeName}.md`;
  const participants = email.participants.map(p => `- ${p.name || p.email}`).join('\n');
  const content = `---
type: meeting
company: ""
date: ${date}
processed: false
---

# ${email.subject}

## Participants
${participants}

## Context
From: ${email.from.name || email.from.email}
Email thread: kenaz://${email.threadId}

## Notes

`;
  return fetch(url('laguz', '/api/note'), {
    method: 'POST',
    body: JSON.stringify({ path, content }),
  });
}

export async function createEventFromEmail(fetch: Fetcher, email: EmailContext) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const end = new Date(tomorrow);
  end.setMinutes(30);
  const attendees = email.participants
    .map(p => p.email)
    .filter(e => e && e.includes('@'));

  return fetch(url('dagaz', '/api/events'), {
    method: 'POST',
    body: JSON.stringify({
      summary: email.subject,
      description: `Related email thread in Kenaz\n\n${email.snippet}`,
      start: tomorrow.toISOString(),
      end: end.toISOString(),
      attendees,
    }),
  });
}

// ── Task → other apps ───────────────────────────────────────

export interface TaskContext {
  id: string;
  title: string;
  notes: string;
  dueDate: string | null;
  tags?: string[];
}

export async function createDraftFromTask(fetch: Fetcher, task: TaskContext) {
  return fetch(url('kenaz', '/api/draft'), {
    method: 'POST',
    body: JSON.stringify({
      to: '',
      subject: task.title,
      body_markdown: task.notes || '',
    }),
  });
}

export async function createNoteFromTask(fetch: Fetcher, task: TaskContext) {
  const date = new Date().toISOString().slice(0, 10);
  const safeName = task.title.replace(/[/\\:*?"<>|]/g, '-').replace(/^\[.*?\]\s*/, '').slice(0, 80);
  const path = `tasks/${safeName}.md`;
  const content = `---
type: resource
date: ${date}
---

# ${task.title}

${task.notes || ''}
`;
  return fetch(url('laguz', '/api/note'), {
    method: 'POST',
    body: JSON.stringify({ path, content }),
  });
}

export async function createEventFromTask(fetch: Fetcher, task: TaskContext) {
  const start = task.dueDate
    ? new Date(task.dueDate + 'T10:00:00')
    : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; })();
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 30);

  return fetch(url('dagaz', '/api/events'), {
    method: 'POST',
    body: JSON.stringify({
      summary: task.title,
      description: task.notes || '',
      start: start.toISOString(),
      end: end.toISOString(),
    }),
  });
}

// ── Calendar Event → other apps ─────────────────────────────

export interface EventContext {
  id: string;
  summary: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
  attendees: { email: string; displayName?: string | null }[];
  organizerEmail: string | null;
}

export async function createDraftFromEvent(fetch: Fetcher, event: EventContext) {
  const to = event.attendees
    .map(a => a.email)
    .filter(e => e && e !== event.organizerEmail)
    .join(', ');

  return fetch(url('kenaz', '/api/draft'), {
    method: 'POST',
    body: JSON.stringify({
      to,
      subject: `Re: ${event.summary}`,
      body_markdown: '',
    }),
  });
}

export async function createNoteFromEvent(fetch: Fetcher, event: EventContext) {
  const date = new Date(event.startTime).toISOString().slice(0, 10);
  const safeName = event.summary.replace(/[/\\:*?"<>|]/g, '-').slice(0, 80);
  const path = `meetings/${date} - ${safeName}.md`;
  const attendees = event.attendees
    .map(a => `- ${a.displayName || a.email}`)
    .join('\n');

  const content = `---
type: meeting
company: ""
date: ${date}
processed: false
---

# ${event.summary}

## Attendees
${attendees}

## Agenda

## Notes

## Action Items

`;
  return fetch(url('laguz', '/api/note'), {
    method: 'POST',
    body: JSON.stringify({ path, content }),
  });
}

export async function createTodoFromEvent(fetch: Fetcher, event: EventContext) {
  const date = new Date(event.startTime).toISOString().slice(0, 10);
  const attendees = event.attendees
    .map(a => a.displayName || a.email)
    .join(', ');

  return fetch(url('raido', '/api/task'), {
    method: 'POST',
    body: JSON.stringify({
      title: `Prepare: ${event.summary}`,
      notes: `Meeting on ${date}\nAttendees: ${attendees}\n${event.location ? `Location: ${event.location}\n` : ''}`,
      due_date: date,
      calendar_event_id: event.id,
    }),
  });
}

// ── Note → other apps ───────────────────────────────────────

export interface NoteContext {
  path: string;
  title: string;
  content: string;
  type: string | null;
  company: string | null;
  date: string | null;
}

export async function createDraftFromNote(fetch: Fetcher, note: NoteContext) {
  const excerpt = note.content
    .replace(/^---[\s\S]*?---\s*/, '')
    .replace(/^#.*\n/, '')
    .trim()
    .slice(0, 500);

  return fetch(url('kenaz', '/api/draft'), {
    method: 'POST',
    body: JSON.stringify({
      to: '',
      subject: note.title,
      body_markdown: excerpt,
    }),
  });
}

export async function createEventFromNote(fetch: Fetcher, note: NoteContext) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const end = new Date(tomorrow);
  end.setMinutes(30);

  return fetch(url('dagaz', '/api/events'), {
    method: 'POST',
    body: JSON.stringify({
      summary: note.title,
      description: `Related note: ${note.path}`,
      start: tomorrow.toISOString(),
      end: end.toISOString(),
    }),
  });
}

export async function createTodoFromNote(fetch: Fetcher, note: NoteContext) {
  return fetch(url('raido', '/api/task'), {
    method: 'POST',
    body: JSON.stringify({
      title: note.title,
      notes: `From vault: ${note.path}`,
      vault_path: note.path,
    }),
  });
}
