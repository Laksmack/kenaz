// Tauri-mode shim for window.raido (see Laguz's laguz-tauri-shim.ts for the
// rationale). Installs a fetch-backed window.raido against the Raidō Express
// server when Electron's preload bridge is absent. Never clobbers Electron.
//
// PoC port 13142 so it runs alongside Electron Raidō on :3142.

const API_BASE = 'http://localhost:13142';

function q(params: Record<string, unknown>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

async function jget<T = any>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}${q(params)}`);
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function jsend<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

function notImpl(method: string) {
  return (..._args: unknown[]) => {
    console.warn(`[raido-tauri-shim] ${method}() not implemented in Tauri mode`);
    return Promise.resolve(null);
  };
}

const enc = encodeURIComponent;

const SHIM_MARKER = '__raidoTauriShimInstalled';
if (typeof (window as any).raido === 'undefined' || (window as any)[SHIM_MARKER]) {
  console.log('[raido-tauri-shim] installing fetch-backed window.raido (Tauri mode)');
  (window as any)[SHIM_MARKER] = true;

  (window as any).raido = {
    // ── Tasks (HTTP wraps lists in {tasks}; IPC returned bare arrays) ──
    getToday: () => jget('/api/today').then((r: any) => r.tasks ?? r),
    getInbox: () => jget('/api/inbox').then((r: any) => r.tasks ?? r),
    getUpcoming: () => jget('/api/upcoming').then((r: any) => r.tasks ?? r),
    getDeferred: () => jget('/api/deferred').then((r: any) => r.tasks ?? r),
    getLogbook: (days?: number) => jget('/api/logbook', { days }).then((r: any) => r.tasks ?? r),
    searchTasks: (query: string) => jget('/api/search', { q: query }).then((r: any) => r.tasks ?? r),
    getTaggedTasks: (tag: string) => jget(`/api/tagged/${enc(tag)}`).then((r: any) => r.tasks ?? r),
    getTask: (id: string) => jget(`/api/task/${enc(id)}`),
    createTask: (data: unknown) => jsend('POST', '/api/task', data),
    updateTask: (id: string, updates: unknown) => jsend('PUT', `/api/task/${enc(id)}`, updates),
    deleteTask: (id: string) => jsend('DELETE', `/api/task/${enc(id)}`),
    completeTask: (id: string) => jsend('POST', `/api/task/${enc(id)}/complete`),
    getStats: () => jget('/api/stats'),

    // ── Groups / tags ──
    getGroups: () => jget('/api/groups').then((r: any) => r.groups ?? r),
    getGroup: (name: string) => jget(`/api/group/${enc(name)}`).then((r: any) => r.tasks ?? r),
    getTags: () => jget('/api/tags').then((r: any) => r.tags ?? r),

    // ── Checklist ──
    getChecklistItems: (taskId: string) =>
      jget(`/api/task/${enc(taskId)}/checklist`).then((r: any) => r.items ?? r),
    addChecklistItem: (taskId: string, title: string) =>
      jsend('POST', `/api/task/${enc(taskId)}/checklist`, { title }),
    updateChecklistItem: (id: string, updates: unknown) =>
      jsend('PUT', `/api/checklist/${enc(id)}`, updates),
    deleteChecklistItem: (id: string) => jsend('DELETE', `/api/checklist/${enc(id)}`),

    // ── Attachments (open/add need native dialogs — stubbed) ──
    getAttachments: (taskId: string) =>
      jget(`/api/task/${enc(taskId)}/attachments`).then((r: any) => r.attachments ?? r),
    addAttachment: notImpl('addAttachment'),
    openAttachment: notImpl('openAttachment'),
    deleteAttachment: (taskId: string, attachmentId: string) =>
      jsend('DELETE', `/api/task/${enc(taskId)}/attachment/${enc(attachmentId)}`),

    // ── Comments ──
    getComments: (taskId: string) =>
      jget(`/api/task/${enc(taskId)}/comments`).then((r: any) => r.comments ?? r),
    addComment: (taskId: string, bodyHtml: string) =>
      jsend('POST', `/api/task/${enc(taskId)}/comments`, { bodyHtml }),
    updateComment: (id: string, bodyHtml: string) =>
      jsend('PUT', `/api/comment/${enc(id)}`, { bodyHtml }),
    deleteComment: (id: string) => jsend('DELETE', `/api/comment/${enc(id)}`),

    // ── Config ──
    getConfig: () => jget('/api/config'),
    setConfig: (updates: unknown) => jsend('PUT', '/api/config', updates),

    // ── Native-only (stubbed for now) ──
    setBadge: notImpl('setBadge'),
    notify: notImpl('notify'),
    exportBackup: notImpl('exportBackup'),
    revealDataFolder: notImpl('revealDataFolder'),

    // ── Linear (no HTTP routes yet) ──
    linearTestConnection: () => Promise.resolve({ ok: false, message: 'Linear not wired in Tauri mode' }),
    linearListTeams: notImpl('linearListTeams'),
    linearGetIssue: notImpl('linearGetIssue'),
    linearSearchIssues: notImpl('linearSearchIssues'),
    linearCreateIssue: notImpl('linearCreateIssue'),
    linearUpdateIssue: notImpl('linearUpdateIssue'),
    linearAddComment: notImpl('linearAddComment'),

    // ── MCP ──
    getMcpStatus: () => Promise.resolve({ running: false }),

    // ── Cross-app ──
    crossAppFetch: (url: string, options?: RequestInit) =>
      fetch(url, options).then(async (r) => ({ ok: r.ok, status: r.status, text: await r.text() })),

    // ── Updates / push (no-ops) ──
    onUpdateState: (_cb: (s: unknown) => void) => () => {},
    checkForUpdates: notImpl('checkForUpdates'),
    installUpdate: notImpl('installUpdate'),
    onTasksChanged: (_cb: () => void) => () => {},
  };
}

export {};
