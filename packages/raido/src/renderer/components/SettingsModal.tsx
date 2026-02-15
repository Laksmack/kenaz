import React, { useState, useEffect, useCallback } from 'react';
import type { AppConfig, NumeralStyle } from '../../shared/types';

interface Props {
  onClose: () => void;
}

type SettingsTab = 'general' | 'api' | 'mcp';

export function SettingsModal({ onClose }: Props) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.raido.getConfig().then(setConfig);
  }, []);

  const handleSave = useCallback(async (updates: Partial<AppConfig>) => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await window.raido.setConfig(updates);
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save config:', e);
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => { setSaved(false); }, [activeTab]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onClose]);

  if (!config) return null;

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'api', label: 'API', icon: '🔌' },
    { id: 'mcp', label: 'MCP', icon: 'ᚱ' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-bg-secondary rounded-xl border border-border-subtle shadow-2xl w-[640px] h-[540px] flex overflow-hidden">
        {/* Sidebar tabs */}
        <div className="w-44 bg-bg-primary border-r border-border-subtle p-3 flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-text-primary px-3 py-2 mb-1">Settings</h2>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                activeTab === tab.id
                  ? 'bg-accent-primary/10 text-accent-primary border-l-2 border-accent-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover border-l-2 border-transparent'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          <div className="px-3 py-2 text-[10px] text-text-muted">
            <kbd className="inline-flex items-center justify-center w-6 h-6 text-xs font-mono rounded bg-bg-tertiary text-text-secondary border border-border-subtle text-[9px]">⌥ ,</kbd> to toggle
          </div>
        </div>

        {/* Content */}
        <div key={activeTab} className="flex-1 p-6 overflow-y-auto animate-fadeIn">
          {activeTab === 'general' && (
            <GeneralSettings config={config} onSave={handleSave} saving={saving} saved={saved} />
          )}
          {activeTab === 'api' && (
            <APISettings config={config} onSave={handleSave} saving={saving} saved={saved} />
          )}
          {activeTab === 'mcp' && (
            <McpSettings config={config} onSave={handleSave} saving={saving} saved={saved} />
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Tab Content Components ────────────────────────────────────

interface TabProps {
  config: AppConfig;
  onSave: (updates: Partial<AppConfig>) => void;
  saving: boolean;
  saved?: boolean;
}

function GeneralSettings({ config, onSave, saving, saved }: TabProps) {
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(config.theme ?? 'dark');
  const [numeralStyle, setNumeralStyle] = useState<NumeralStyle>(config.numeralStyle ?? 'arabic');

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-4">General</h3>
      <div className="space-y-4">
        <SettingsField label="Theme" description="Choose the app color theme. System will follow your macOS appearance. Restart required after changes.">
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as 'dark' | 'light' | 'system')}
            className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">System</option>
          </select>
        </SettingsField>

        <SettingsField label="Dock Badge Number Style" description="Choose how numbers are displayed in the dock badge. Changes take effect immediately.">
          <div className="flex gap-3">
            <button
              onClick={() => {
                setNumeralStyle('arabic');
                onSave({ numeralStyle: 'arabic' });
              }}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors ${
                numeralStyle === 'arabic'
                  ? 'border-accent-primary bg-accent-primary/5'
                  : 'border-border-subtle hover:border-border-active bg-bg-primary'
              }`}
            >
              {/* Arabic preview badge */}
              <svg width="36" height="36" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="17" fill="#C2885A" />
                <text x="18" y="19" textAnchor="middle" dominantBaseline="central"
                  fill="#FFFFFF" fontFamily="system-ui" fontWeight="bold" fontSize="20">7</text>
              </svg>
              <div className="text-left">
                <div className="text-xs font-medium text-text-primary">Arabic</div>
                <div className="text-[10px] text-text-muted">1, 2, 3 ...</div>
              </div>
            </button>

            <button
              onClick={() => {
                setNumeralStyle('runic');
                onSave({ numeralStyle: 'runic' });
              }}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors ${
                numeralStyle === 'runic'
                  ? 'border-accent-primary bg-accent-primary/5'
                  : 'border-border-subtle hover:border-border-active bg-bg-primary'
              }`}
            >
              {/* Runic preview badge: pentadic 7 = stav + bow + 2 ticks */}
              <svg width="36" height="36" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="17" fill="#C2885A" />
                {/* Stav */}
                <line x1="16" y1="7" x2="16" y2="29" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
                {/* Bow (right) at top */}
                <path d="M16 9 Q24 14 16 19" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                {/* Tick 1 */}
                <line x1="16" y1="22" x2="24" y2="22" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
                {/* Tick 2 */}
                <line x1="16" y1="26" x2="24" y2="26" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <div className="text-left">
                <div className="text-xs font-medium text-text-primary">Runic</div>
                <div className="text-[10px] text-text-muted">Pentadic numerals</div>
              </div>
            </button>
          </div>
        </SettingsField>

        <SaveButton onClick={() => onSave({ theme })} saving={saving} saved={saved} />
      </div>
    </div>
  );
}

function APISettings({ config, onSave, saving, saved }: TabProps) {
  const [enabled, setEnabled] = useState(config.apiEnabled);
  const [port, setPort] = useState(config.apiPort);
  const [copiedEndpoints, setCopiedEndpoints] = useState(false);

  const base = `http://localhost:${port}`;

  const apiReference = `# Raidō API Reference
# Base URL: ${base}
# All endpoints return JSON. POST/PUT require Content-Type: application/json.
#
# Date Model: Every task has one date field — due_date.
# Tasks with a due_date are scheduled. Tasks without one live in Inbox.


# ═══════════════════════════════════════════════════════
# VIEWS (Smart Lists)
# ═══════════════════════════════════════════════════════

GET ${base}/api/today
# Tasks due today or overdue (due_date <= today, status = open)
# Response: { "tasks": [...] }

GET ${base}/api/inbox
# Tasks with no due_date and no project (status = open)
# Response: { "tasks": [...] }

GET ${base}/api/upcoming
# Tasks with future due dates (due_date > today, status = open)
# Response: { "tasks": [...] }

GET ${base}/api/logbook?days=7
# Recently completed tasks (default: last 7 days)
# Response: { "tasks": [...] }


# ═══════════════════════════════════════════════════════
# TASKS
# ═══════════════════════════════════════════════════════

GET ${base}/api/task/:id
# Get a single task with tags
# Response: { "id": "...", "title": "...", "notes": "...", "status": "open", "priority": 2, ... }

POST ${base}/api/task
# Create a new task. Omit due_date to send to Inbox.
# Payload:
# {
#   "title": "Buy groceries",              (required)
#   "notes": "Milk, eggs, bread",           (optional)
#   "due_date": "2026-02-20",               (optional, YYYY-MM-DD — omit for Inbox)
#   "project_id": "uuid",                   (optional)
#   "priority": 2,                          (optional, 0-3)
#   "tags": ["errands", "personal"],         (optional)
#   "heading": "Morning tasks",             (optional, group within project)
#   "kenaz_thread_id": "gmail_thread_id",   (optional, cross-link to email)
#   "hubspot_deal_id": "deal_id",           (optional, cross-link to deal)
#   "vault_path": "notes/project.md",       (optional, cross-link to vault)
#   "calendar_event_id": "event_id"         (optional, cross-link to calendar)
# }
# Response: { "id": "...", "title": "...", ... }

PUT ${base}/api/task/:id
# Update task fields (partial update)
# Payload: { "title": "Updated title", "priority": 3 }
# Response: { "id": "...", ... }

DELETE ${base}/api/task/:id
# Delete a task permanently
# Response: { "success": true }

POST ${base}/api/task/:id/complete
# Mark task as completed (sets completed_at timestamp)
# Response: { "id": "...", "status": "completed", "completed_at": "...", ... }


# ═══════════════════════════════════════════════════════
# PROJECTS
# ═══════════════════════════════════════════════════════

GET ${base}/api/projects
# All open projects with task counts
# Response: { "projects": [{ "id": "...", "title": "...", "task_count": 5, "open_task_count": 3 }] }

GET ${base}/api/project/:id
# Project detail with all tasks grouped by heading
# Response: { "id": "...", "title": "...", "tasks": [...] }

POST ${base}/api/project
# Create project. Payload: { "title": "New Project", "notes": "...", "area_id": "..." }

PUT ${base}/api/project/:id
# Update project. Payload: { "title": "Updated", "notes": "..." }

POST ${base}/api/project/:id/complete
# Complete a project


# ═══════════════════════════════════════════════════════
# SEARCH, TAGS & STATS
# ═══════════════════════════════════════════════════════

GET ${base}/api/search?q=<query>
# Full-text search across task titles and notes
# Response: { "tasks": [...] }

GET ${base}/api/tags
# All tags with usage counts
# Response: { "tags": [{ "id": "...", "name": "errands", "count": 5 }] }

GET ${base}/api/tagged/:tagName
# All tasks with a specific tag
# Response: { "tasks": [...] }

GET ${base}/api/stats
# Quick counts for badge and daily briefing
# Response: { "overdue": 2, "today": 5, "inbox": 3, "total_open": 42 }

GET ${base}/api/areas
# All areas with their projects
# Response: { "areas": [{ "id": "...", "title": "Work", "projects": [...] }] }


# ═══════════════════════════════════════════════════════
# EXAMPLE WORKFLOWS
# ═══════════════════════════════════════════════════════

# Quick add from terminal:
# curl -X POST ${base}/api/task -H "Content-Type: application/json" \\
#   -d '{"title":"Review PR #42","when_date":"2026-02-15","priority":2}'

# Check today's tasks:
# curl ${base}/api/today

# Get stats for daily briefing:
# curl ${base}/api/stats

# Complete a task:
# curl -X POST ${base}/api/task/TASK_ID/complete

# Search for tasks:
# curl "${base}/api/search?q=meeting"
`;

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">Local API Server</h3>
      <p className="text-xs text-text-muted mb-4">
        The API server lets external tools (Claude Desktop, scripts, automations) interact with your tasks.
        Restart required after changes.
      </p>
      <div className="space-y-4">
        <SettingsField label="Enable API Server" description="Run a local HTTP server for external tool integration">
          <ToggleSwitch checked={enabled} onChange={(v) => { setEnabled(v); onSave({ apiEnabled: v }); }} />
        </SettingsField>

        {enabled && (
          <>
            <SettingsField label="Port" description="The port the API server listens on (default: 3142)">
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value) || 3142)}
                className="w-32 bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary font-mono"
                min={1024}
                max={65535}
              />
            </SettingsField>

            <div className="p-3 rounded-lg bg-bg-primary border border-border-subtle">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-text-secondary">API Endpoints</div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(apiReference);
                    setCopiedEndpoints(true);
                    setTimeout(() => setCopiedEndpoints(false), 2000);
                  }}
                  className="text-[10px] text-text-muted hover:text-text-secondary transition-colors flex items-center gap-1"
                >
                  {copiedEndpoints ? (
                    <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Copied!</>
                  ) : (
                    <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy API Reference</>
                  )}
                </button>
              </div>
              <div className="space-y-0.5 text-[10px] font-mono text-text-muted">
                <div className="text-[9px] text-text-secondary font-semibold mt-1 mb-0.5 font-sans uppercase tracking-wider">Views</div>
                <div><span className="text-accent-success">GET</span>  /api/today</div>
                <div><span className="text-accent-success">GET</span>  /api/inbox</div>
                <div><span className="text-accent-success">GET</span>  /api/upcoming</div>
                <div><span className="text-accent-success">GET</span>  /api/logbook?days=7</div>
                <div className="text-[9px] text-text-secondary font-semibold mt-2 mb-0.5 font-sans uppercase tracking-wider">Tasks</div>
                <div><span className="text-accent-success">GET</span>  /api/task/:id</div>
                <div><span className="text-accent-primary">POST</span> /api/task</div>
                <div><span className="text-accent-warning">PUT</span>  /api/task/:id</div>
                <div><span className="text-accent-danger">DEL</span>  /api/task/:id</div>
                <div><span className="text-accent-primary">POST</span> /api/task/:id/complete</div>
                <div className="text-[9px] text-text-secondary font-semibold mt-2 mb-0.5 font-sans uppercase tracking-wider">Projects</div>
                <div><span className="text-accent-success">GET</span>  /api/projects</div>
                <div><span className="text-accent-success">GET</span>  /api/project/:id</div>
                <div><span className="text-accent-primary">POST</span> /api/project</div>
                <div><span className="text-accent-warning">PUT</span>  /api/project/:id</div>
                <div><span className="text-accent-primary">POST</span> /api/project/:id/complete</div>
                <div className="text-[9px] text-text-secondary font-semibold mt-2 mb-0.5 font-sans uppercase tracking-wider">Search & Meta</div>
                <div><span className="text-accent-success">GET</span>  /api/search?q=...</div>
                <div><span className="text-accent-success">GET</span>  /api/stats</div>
                <div><span className="text-accent-success">GET</span>  /api/tags</div>
                <div><span className="text-accent-success">GET</span>  /api/tagged/:tag</div>
                <div><span className="text-accent-success">GET</span>  /api/areas</div>
              </div>
            </div>

            <SaveButton onClick={() => onSave({ apiPort: port })} saving={saving} saved={saved} />
          </>
        )}
      </div>
    </div>
  );
}

function McpSettings({ config, onSave, saving, saved }: TabProps) {
  const [enabled, setEnabled] = useState(config.mcpEnabled ?? false);
  const [mcpStatus, setMcpStatus] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.raido.getMcpStatus().then(setMcpStatus);
  }, [enabled]);

  const claudeConfig = mcpStatus?.claudeDesktopConfig
    ? JSON.stringify(mcpStatus.claudeDesktopConfig, null, 2)
    : '';

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">MCP Server</h3>
      <p className="text-xs text-text-muted mb-4">
        Expose Raidō as a Model Context Protocol server for Claude Desktop.
        Gives Claude native access to your tasks, projects, and more.
        Requires the API server to be enabled. Restart required after changes.
      </p>
      <div className="space-y-4">
        {!config.apiEnabled && (
          <div className="px-3 py-2 rounded-lg bg-accent-warning/10 text-accent-warning text-xs font-medium">
            The API server must be enabled first (Settings → API).
          </div>
        )}

        <SettingsField label="Enable MCP Server" description="Allow Claude Desktop to connect to Raidō via MCP">
          <ToggleSwitch
            checked={enabled}
            onChange={(v) => {
              setEnabled(v);
              onSave({ mcpEnabled: v });
            }}
          />
        </SettingsField>

        {enabled && config.apiEnabled && (
          <>
            <div className="p-3 rounded-lg bg-bg-primary border border-border-subtle">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-text-secondary">Claude Desktop Configuration</div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(claudeConfig);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="text-[10px] text-text-muted hover:text-text-secondary transition-colors flex items-center gap-1"
                >
                  {copied ? (
                    <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Copied!</>
                  ) : (
                    <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy</>
                  )}
                </button>
              </div>
              <pre className="text-[10px] font-mono text-text-muted whitespace-pre overflow-x-auto">{claudeConfig}</pre>
              <p className="text-[10px] text-text-muted mt-2">
                Paste this into your <span className="font-mono">claude_desktop_config.json</span> file.
                On macOS: <span className="font-mono">~/Library/Application Support/Claude/claude_desktop_config.json</span>
              </p>
            </div>

            <div className="p-3 rounded-lg bg-bg-primary border border-border-subtle">
              <div className="text-xs font-medium text-text-secondary mb-2">Available Tools (16)</div>
              <div className="space-y-0.5 text-[10px] font-mono text-text-muted">
                <div className="text-[9px] text-text-secondary font-semibold mt-1 mb-0.5 font-sans uppercase tracking-wider">Read</div>
                <div>get_today, get_inbox, get_upcoming</div>
                <div>get_projects, get_project</div>
                <div className="text-[9px] text-text-secondary font-semibold mt-2 mb-0.5 font-sans uppercase tracking-wider">Write</div>
                <div>add_todo, update_todo</div>
                <div>add_project, update_project</div>
                <div className="text-[9px] text-text-secondary font-semibold mt-2 mb-0.5 font-sans uppercase tracking-wider">Search & Stats</div>
                <div>search_todos, search_advanced, get_logbook</div>
                <div>get_stats, get_tags, get_tagged_items, get_areas</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Shared Components ─────────────────────────────────────────

function SettingsField({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-primary mb-1">{label}</label>
      {description && (
        <p className="text-[11px] text-text-muted mb-2">{description}</p>
      )}
      {children}
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? 'bg-accent-primary' : 'bg-bg-tertiary'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

function SaveButton({ onClick, saving, saved }: { onClick: () => void; saving: boolean; saved?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={`px-4 py-1.5 text-xs rounded-lg font-medium transition-colors ${
        saved
          ? 'bg-accent-success/15 text-accent-success'
          : 'bg-accent-primary hover:bg-accent-deep disabled:opacity-50 text-white'
      }`}
    >
      {saving ? 'Saving...' : saved ? 'Saved \u2713' : 'Save'}
    </button>
  );
}
