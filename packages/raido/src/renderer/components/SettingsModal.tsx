import React, { useState, useEffect, useCallback } from 'react';
import type { AppConfig } from '../../shared/types';

interface Props {
  onClose: () => void;
}

type SettingsTab = 'general' | 'hubspot' | 'api' | 'mcp';

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
    { id: 'hubspot', label: 'HubSpot', icon: '🟠' },
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
          {activeTab === 'hubspot' && (
            <HubSpotSettings config={config} onSave={handleSave} saving={saving} saved={saved} />
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

interface HubSpotPipeline {
  id: string;
  label: string;
  stages: { id: string; label: string }[];
}

function HubSpotSettings({ config, onSave, saving, saved }: TabProps) {
  const [enabled, setEnabled] = useState(config.hubspot_enabled ?? false);
  const [portalId, setPortalId] = useState(config.hubspot_portal_id ?? '');
  const [ownerId, setOwnerId] = useState(config.hubspot_owner_id ?? '');
  const [selectedPipelines, setSelectedPipelines] = useState<string[]>(config.hubspot_pipelines ?? []);
  const [excludedStages, setExcludedStages] = useState<string[]>(config.hubspot_excluded_stages ?? []);

  const [pipelines, setPipelines] = useState<HubSpotPipeline[]>([]);
  const [fetchingPipelines, setFetchingPipelines] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const fetchPipelines = useCallback(async () => {
    setFetchingPipelines(true);
    setFetchError(false);
    try {
      const data = await window.raido.crossAppFetch('http://localhost:3141/api/hubspot/pipelines');
      setPipelines(data.pipelines || []);
    } catch {
      setFetchError(true);
    } finally {
      setFetchingPipelines(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) fetchPipelines();
  }, [enabled, fetchPipelines]);

  const togglePipeline = (id: string) => {
    setSelectedPipelines(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const toggleStageExclusion = (id: string) => {
    setExcludedStages(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const visibleStages = pipelines
    .filter(p => selectedPipelines.length === 0 || selectedPipelines.includes(p.id))
    .flatMap(p => p.stages.map(s => ({ ...s, pipelineLabel: p.label })));

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">HubSpot Integration</h3>
      <p className="text-xs text-text-muted mb-4">
        Connect to HubSpot through Kenaz to show deal pulse in the Today dashboard and Pipeline view.
        The actual API token is configured in Kenaz — these settings control how Raiðo queries and links to your portal.
      </p>
      <div className="space-y-4">
        <SettingsField label="Enable HubSpot" description="Show HubSpot deals in the Today dashboard (Zone C) and Pipeline view">
          <ToggleSwitch checked={enabled} onChange={(v) => { setEnabled(v); onSave({ hubspot_enabled: v }); }} />
        </SettingsField>

        {enabled && (
          <>
            <SettingsField label="Portal ID" description="Your HubSpot account ID (the number in your HubSpot URLs, e.g. 7917625). Used to build clickable links to deals.">
              <input
                value={portalId}
                onChange={(e) => setPortalId(e.target.value.trim())}
                placeholder="e.g. 7917625"
                className="w-48 bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary font-mono"
              />
            </SettingsField>

            <SettingsField label="Owner ID" description="Your HubSpot user/owner ID. Filters deals to only show yours. Find it in HubSpot → Settings → Users & Teams → click your name → the ID in the URL.">
              <input
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value.trim())}
                placeholder="e.g. 12345678"
                className="w-48 bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary font-mono"
              />
            </SettingsField>

            {/* Pipelines — fetched from HubSpot */}
            <SettingsField label="Pipelines" description="Select which pipelines to include. Leave all unchecked to show deals from every pipeline.">
              {fetchingPipelines ? (
                <div className="text-[10px] text-text-muted animate-pulse">Loading pipelines from HubSpot…</div>
              ) : fetchError ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-accent-danger">Could not reach Kenaz — is it running?</span>
                  <button onClick={fetchPipelines} className="text-[10px] text-accent-primary hover:underline">Retry</button>
                </div>
              ) : pipelines.length === 0 ? (
                <div className="text-[10px] text-text-muted">No pipelines found</div>
              ) : (
                <div className="space-y-1.5">
                  {pipelines.map(p => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedPipelines.includes(p.id)}
                        onChange={() => togglePipeline(p.id)}
                        className="rounded border-border-subtle accent-accent-primary"
                      />
                      <span className="text-xs text-text-primary group-hover:text-accent-primary transition-colors">{p.label}</span>
                      <span className="text-[9px] text-text-muted font-mono">{p.id}</span>
                    </label>
                  ))}
                </div>
              )}
            </SettingsField>

            {/* Stages — exclude list */}
            {visibleStages.length > 0 && (
              <SettingsField label="Stages" description="Uncheck stages you want to hide. Closed stages are always excluded automatically.">
                <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                  {visibleStages.map(s => {
                    const isClosed = /^closed/i.test(s.label);
                    const isExcluded = excludedStages.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className={`flex items-center gap-2 cursor-pointer group ${isClosed ? 'opacity-40' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={!isExcluded && !isClosed}
                          disabled={isClosed}
                          onChange={() => toggleStageExclusion(s.id)}
                          className="rounded border-border-subtle accent-accent-primary"
                        />
                        <span className={`text-xs ${isClosed ? 'text-text-muted line-through' : 'text-text-primary group-hover:text-accent-primary'} transition-colors`}>
                          {s.label}
                        </span>
                        {pipelines.length > 1 && (
                          <span className="text-[9px] text-text-muted">{s.pipelineLabel}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </SettingsField>
            )}

            <div className="p-3 rounded-lg bg-bg-primary border border-border-subtle">
              <div className="text-[10px] text-text-muted space-y-1">
                <div className="text-[9px] text-text-secondary font-semibold uppercase tracking-wider mb-1">How it works</div>
                <div>Raiðo proxies HubSpot requests through Kenaz (port 3141). Make sure Kenaz is running and has a valid HubSpot API token configured.</div>
                <div className="mt-2"><span className="font-semibold text-text-secondary">Portal ID</span> — in any HubSpot URL: <span className="font-mono">app.hubspot.com/contacts/<span className="text-accent-primary">7917625</span>/...</span></div>
                <div><span className="font-semibold text-text-secondary">Owner ID</span> — filters the deal list to just your deals. Without it, you'll see all deals in the portal.</div>
              </div>
            </div>

            <SaveButton
              onClick={() => onSave({
                hubspot_portal_id: portalId,
                hubspot_owner_id: ownerId,
                hubspot_pipelines: selectedPipelines,
                hubspot_excluded_stages: excludedStages,
              })}
              saving={saving}
              saved={saved}
            />
          </>
        )}
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
  const [mcpStatus, setMcpStatus] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.raido.getMcpStatus().then(setMcpStatus);
  }, []);

  const claudeConfig = mcpStatus?.claudeDesktopConfig
    ? JSON.stringify(mcpStatus.claudeDesktopConfig, null, 2)
    : '';

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">Futhark MCP</h3>
      <p className="text-xs text-text-muted mb-4">
        A unified MCP server gives Claude Desktop access to all Futhark apps —
        email, tasks, calendar, and notes — through a single connection.
        Auto-registered with Claude Desktop on first launch.
      </p>
      <div className="space-y-4">
        <SettingsField label="Status">
          <span className={`text-xs flex items-center gap-1.5 ${mcpStatus?.installed ? 'text-accent-success' : 'text-text-muted'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${mcpStatus?.installed ? 'bg-accent-success' : 'bg-text-muted'}`} />
            {mcpStatus?.installed ? 'Installed' : 'Not installed — restart app to install'}
          </span>
        </SettingsField>

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
            This should be auto-registered. If needed, paste into{' '}
            <span className="font-mono">~/Library/Application Support/Claude/claude_desktop_config.json</span>
          </p>
        </div>
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
