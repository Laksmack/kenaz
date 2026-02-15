import React, { useState, useEffect, useCallback } from 'react';
import type { AppConfig } from '../../shared/types';

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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-bg-secondary rounded-xl border border-border-subtle shadow-2xl w-[640px] h-[540px] flex overflow-hidden">
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
            <kbd className="inline-flex items-center justify-center w-6 h-6 text-xs font-mono rounded bg-bg-tertiary text-text-secondary border border-border-subtle text-[9px]">⌘ ,</kbd> to toggle
          </div>
        </div>

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
#
# Groups: Tasks self-organize via [BracketPrefix] in their titles.
# e.g. "[Conagra] Review cameras" belongs to the "Conagra" group.


# ═══════════════════════════════════════════════════════
# VIEWS (Smart Lists)
# ═══════════════════════════════════════════════════════

GET ${base}/api/today
# Tasks due today or overdue (due_date <= today, status = open)

GET ${base}/api/inbox
# Tasks with no due_date (status = open)

GET ${base}/api/upcoming
# Tasks with future due dates (due_date > today, status = open)

GET ${base}/api/logbook?days=7
# Recently completed tasks (default: last 7 days)


# ═══════════════════════════════════════════════════════
# GROUPS (Bracket Prefix)
# ═══════════════════════════════════════════════════════

GET ${base}/api/groups
# All bracket groups with open task counts
# Response: { "groups": [{ "name": "Conagra", "count": 3 }] }

GET ${base}/api/group/:name
# All open tasks in a bracket group
# Response: { "tasks": [...] }


# ═══════════════════════════════════════════════════════
# TASKS
# ═══════════════════════════════════════════════════════

GET ${base}/api/task/:id

POST ${base}/api/task
# Create a new task. Use [GroupName] prefix for group assignment.
# Payload:
# {
#   "title": "[Conagra] Review cameras",    (required, bracket prefix optional)
#   "notes": "Check all angles",             (optional)
#   "due_date": "2026-02-20",               (optional, YYYY-MM-DD)
#   "tags": ["internal", "review"],          (optional)
#   "kenaz_thread_id": "...",               (optional)
#   "hubspot_deal_id": "...",               (optional)
#   "vault_path": "...",                    (optional)
#   "calendar_event_id": "..."             (optional)
# }

PUT ${base}/api/task/:id
# Update task fields (partial update)

DELETE ${base}/api/task/:id

POST ${base}/api/task/:id/complete


# ═══════════════════════════════════════════════════════
# SEARCH, TAGS & STATS
# ═══════════════════════════════════════════════════════

GET ${base}/api/search?q=<query>
GET ${base}/api/stats
GET ${base}/api/tags
GET ${base}/api/tagged/:tagName
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
                <div className="text-[9px] text-text-secondary font-semibold mt-2 mb-0.5 font-sans uppercase tracking-wider">Groups</div>
                <div><span className="text-accent-success">GET</span>  /api/groups</div>
                <div><span className="text-accent-success">GET</span>  /api/group/:name</div>
                <div className="text-[9px] text-text-secondary font-semibold mt-2 mb-0.5 font-sans uppercase tracking-wider">Tasks</div>
                <div><span className="text-accent-success">GET</span>  /api/task/:id</div>
                <div><span className="text-accent-primary">POST</span> /api/task</div>
                <div><span className="text-accent-warning">PUT</span>  /api/task/:id</div>
                <div><span className="text-accent-danger">DEL</span>  /api/task/:id</div>
                <div><span className="text-accent-primary">POST</span> /api/task/:id/complete</div>
                <div className="text-[9px] text-text-secondary font-semibold mt-2 mb-0.5 font-sans uppercase tracking-wider">Search & Meta</div>
                <div><span className="text-accent-success">GET</span>  /api/search?q=...</div>
                <div><span className="text-accent-success">GET</span>  /api/stats</div>
                <div><span className="text-accent-success">GET</span>  /api/tags</div>
                <div><span className="text-accent-success">GET</span>  /api/tagged/:tag</div>
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
        Gives Claude native access to your tasks, groups, and more.
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
              <div className="text-xs font-medium text-text-secondary mb-2">Available Tools (13)</div>
              <div className="space-y-0.5 text-[10px] font-mono text-text-muted">
                <div className="text-[9px] text-text-secondary font-semibold mt-1 mb-0.5 font-sans uppercase tracking-wider">Read</div>
                <div>get_today, get_inbox, get_upcoming</div>
                <div>get_groups, get_group</div>
                <div className="text-[9px] text-text-secondary font-semibold mt-2 mb-0.5 font-sans uppercase tracking-wider">Write</div>
                <div>add_todo, update_todo</div>
                <div className="text-[9px] text-text-secondary font-semibold mt-2 mb-0.5 font-sans uppercase tracking-wider">Search & Stats</div>
                <div>search_todos, search_advanced, get_logbook</div>
                <div>get_stats, get_tags, get_tagged_items</div>
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
