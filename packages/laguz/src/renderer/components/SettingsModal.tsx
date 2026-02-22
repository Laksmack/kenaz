import React, { useState, useEffect, useCallback } from 'react';
import type { LaguzConfig, Section, CompScienceProfile } from '../types';

type SettingsTab = 'general' | 'editor' | 'sections' | 'profile' | 'api';

interface Props {
  config: LaguzConfig;
  onSave: (config: LaguzConfig) => void;
  onClose: () => void;
}

export function SettingsModal({ config, onSave, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [localConfig, setLocalConfig] = useState<LaguzConfig>(config);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  const handleSave = useCallback(async (updated: LaguzConfig) => {
    setSaving(true);
    setSaved(false);
    try {
      await onSave(updated);
      setLocalConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save config:', e);
    } finally {
      setSaving(false);
    }
  }, [onSave]);

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'editor', label: 'Editor', icon: '✏️' },
    { id: 'sections', label: 'Sections', icon: '📂' },
    { id: 'profile', label: 'Signing Profile', icon: '🖊' },
    { id: 'api', label: 'API', icon: '🔌' },
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
            <GeneralTab config={localConfig} onSave={handleSave} saving={saving} saved={saved} />
          )}
          {activeTab === 'editor' && (
            <EditorTab config={localConfig} onSave={handleSave} saving={saving} saved={saved} />
          )}
          {activeTab === 'sections' && (
            <SectionsTab config={localConfig} onSave={handleSave} saving={saving} saved={saved} />
          )}
          {activeTab === 'profile' && (
            <ProfileTab />
          )}
          {activeTab === 'api' && (
            <ApiTab />
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

// ── General Tab ───────────────────────────────────────────────

function GeneralTab({
  config,
  onSave,
  saving,
  saved,
}: {
  config: LaguzConfig;
  onSave: (c: LaguzConfig) => void;
  saving: boolean;
  saved: boolean;
}) {
  const [vaultPath, setVaultPath] = useState(config.vaultPath);

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-4">General</h3>
      <div className="space-y-4">
        <SettingsField label="Vault Path" description="Path to the vault directory. Use ~ for home. Restart required after changes.">
          <input
            type="text"
            value={vaultPath}
            onChange={(e) => setVaultPath(e.target.value)}
            className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary font-mono"
            placeholder="~/vault"
          />
        </SettingsField>
        <SaveButton onClick={() => onSave({ ...config, vaultPath })} saving={saving} saved={saved} />
      </div>
    </div>
  );
}

// ── Sections Tab ──────────────────────────────────────────────

function SectionsTab({
  config,
  onSave,
  saving,
  saved,
}: {
  config: LaguzConfig;
  onSave: (c: LaguzConfig) => void;
  saving: boolean;
  saved: boolean;
}) {
  const [sections, setSections] = useState<Section[]>(config.sections);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const isBuiltin = (s: Section) => s.type === 'scratch' || s.type === 'vault';

  const move = (index: number, direction: -1 | 1) => {
    const next = [...sections];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next);
  };

  const remove = (id: string) => {
    setSections(prev => prev.filter(s => s.id !== id));
  };

  const updateSection = (id: string, updates: Partial<Section>) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, ...updates } as Section : s));
    setEditingId(null);
  };

  const addSection = (section: Section) => {
    setSections(prev => [...prev, section]);
    setShowAddForm(false);
  };

  const TYPE_BADGES: Record<string, string> = {
    scratch: 'bg-blue-500/15 text-blue-400',
    vault: 'bg-purple-500/15 text-purple-400',
    grouped: 'bg-teal-500/15 text-teal-400',
    flat: 'bg-amber-500/15 text-amber-400',
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">Sidebar Sections</h3>
      <p className="text-[11px] text-text-muted mb-4">
        Configure which sections appear in the sidebar and their order.
      </p>

      <div className="space-y-1 mb-4">
        {sections.map((section, index) => {
          const builtin = isBuiltin(section);

          if (editingId === section.id && !builtin) {
            return (
              <SectionEditForm
                key={section.id}
                section={section as any}
                onSave={(updated) => updateSection(section.id, updated)}
                onCancel={() => setEditingId(null)}
              />
            );
          }

          return (
            <div
              key={section.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-primary border border-border-subtle"
            >
              {!builtin && (
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="text-text-muted hover:text-text-primary disabled:opacity-20 text-[10px]"
                  >▲</button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === sections.length - 1}
                    className="text-text-muted hover:text-text-primary disabled:opacity-20 text-[10px]"
                  >▼</button>
                </div>
              )}
              {builtin && <div className="w-[14px]" />}

              <span className="text-base w-6 text-center">
                {section.type === 'scratch' ? '📝' : section.type === 'vault' ? '🗄' : (section as any).icon || '📁'}
              </span>

              <span className="text-xs font-medium text-text-primary flex-1">{section.label}</span>

              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TYPE_BADGES[section.type] || ''}`}>
                {section.type}
              </span>

              {(section.type === 'grouped' || section.type === 'flat') && (
                <span className="text-[10px] text-text-muted font-mono truncate max-w-[120px]">
                  {section.path}
                </span>
              )}

              {!builtin && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingId(section.id)}
                    className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
                    title="Edit"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => remove(section.id)}
                    className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showAddForm ? (
        <SectionEditForm
          onSave={addSection}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border-subtle text-xs text-text-muted hover:text-text-primary hover:border-accent-primary/40 transition-colors w-full"
        >
          <span>+</span>
          <span>Add Section</span>
        </button>
      )}

      <div className="mt-4">
        <SaveButton
          onClick={() => onSave({ ...config, sections })}
          saving={saving}
          saved={saved}
        />
      </div>
    </div>
  );
}

function SectionEditForm({
  section,
  onSave,
  onCancel,
}: {
  section?: { type: 'grouped' | 'flat'; label: string; path: string; icon: string };
  onSave: (s: any) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<'grouped' | 'flat'>(section?.type || 'grouped');
  const [label, setLabel] = useState(section?.label || '');
  const [sectionPath, setSectionPath] = useState(section?.path || '');
  const [icon, setIcon] = useState(section?.icon || '📁');

  const handleSubmit = () => {
    if (!label.trim() || !sectionPath.trim()) return;
    const base = {
      id: section ? undefined : `section-${Date.now()}`,
      type,
      label: label.trim(),
      path: sectionPath.trim(),
      icon,
      enabled: true,
    };
    onSave(base);
  };

  return (
    <div className="p-3 rounded-lg bg-bg-primary border border-accent-primary/30 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="block text-[10px] font-medium text-text-secondary mb-1">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full bg-bg-secondary border border-border-subtle rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent-primary"
            placeholder="Accounts"
          />
        </div>
        <div className="w-16">
          <label className="block text-[10px] font-medium text-text-secondary mb-1">Icon</label>
          <input
            type="text"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="w-full bg-bg-secondary border border-border-subtle rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent-primary text-center"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-medium text-text-secondary mb-1">Type</label>
        <div className="flex gap-2">
          <button
            onClick={() => setType('grouped')}
            className={`px-3 py-1.5 rounded text-[11px] font-medium transition-colors ${
              type === 'grouped' ? 'bg-teal-500/15 text-teal-400 border border-teal-500/30' : 'bg-bg-secondary text-text-muted border border-border-subtle'
            }`}
          >
            Grouped
          </button>
          <button
            onClick={() => setType('flat')}
            className={`px-3 py-1.5 rounded text-[11px] font-medium transition-colors ${
              type === 'flat' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-bg-secondary text-text-muted border border-border-subtle'
            }`}
          >
            Flat
          </button>
        </div>
        <p className="text-[10px] text-text-muted mt-1">
          {type === 'grouped'
            ? 'Subfolders become individual sidebar items (e.g. accounts by company)'
            : 'Shows all notes in the folder as a single list'}
        </p>
      </div>

      <div>
        <label className="block text-[10px] font-medium text-text-secondary mb-1">Vault Path</label>
        <input
          type="text"
          value={sectionPath}
          onChange={(e) => setSectionPath(e.target.value)}
          className="w-full bg-bg-secondary border border-border-subtle rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent-primary font-mono"
          placeholder="customer management"
        />
        <p className="text-[10px] text-text-muted mt-1">Relative to vault root</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={!label.trim() || !sectionPath.trim()}
          className="px-3 py-1.5 rounded text-xs font-medium bg-accent-primary hover:bg-accent-deep text-white transition-colors disabled:opacity-50"
        >
          {section ? 'Update' : 'Add'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Editor Tab ────────────────────────────────────────────────

function EditorTab({
  config,
  onSave,
  saving,
  saved,
}: {
  config: LaguzConfig;
  onSave: (c: LaguzConfig) => void;
  saving: boolean;
  saved: boolean;
}) {
  const [lineNumbers, setLineNumbers] = useState<'auto' | 'on' | 'off'>(config.editor?.lineNumbers ?? 'auto');

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-4">Editor</h3>
      <div className="space-y-4">
        <SettingsField label="Line Numbers" description="Show line numbers in the editor gutter. 'Auto' shows them for code files but not markdown.">
          <div className="flex gap-2">
            {(['auto', 'on', 'off'] as const).map((val) => (
              <button
                key={val}
                onClick={() => setLineNumbers(val)}
                className={`px-3 py-1.5 rounded text-[11px] font-medium transition-colors capitalize ${
                  lineNumbers === val
                    ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30'
                    : 'bg-bg-primary text-text-muted border border-border-subtle hover:text-text-primary'
                }`}
              >
                {val}
              </button>
            ))}
          </div>
        </SettingsField>

        <div className="p-3 rounded-lg bg-bg-primary border border-border-subtle">
          <div className="text-xs font-medium text-text-secondary mb-2">Keyboard Shortcuts</div>
          <div className="grid grid-cols-2 gap-y-1 text-[11px]">
            <span className="text-text-muted">Find & Replace</span>
            <span className="text-text-secondary font-mono text-[10px]">Cmd+F / Cmd+H</span>
            <span className="text-text-muted">Find Next / Previous</span>
            <span className="text-text-secondary font-mono text-[10px]">Cmd+G / Shift+Cmd+G</span>
            <span className="text-text-muted">Add Cursor</span>
            <span className="text-text-secondary font-mono text-[10px]">Alt+Click</span>
            <span className="text-text-muted">Select Next Occurrence</span>
            <span className="text-text-secondary font-mono text-[10px]">Cmd+D</span>
            <span className="text-text-muted">Save</span>
            <span className="text-text-secondary font-mono text-[10px]">Cmd+S</span>
            <span className="text-text-muted">Undo / Redo</span>
            <span className="text-text-secondary font-mono text-[10px]">Cmd+Z / Shift+Cmd+Z</span>
          </div>
        </div>

        <SaveButton
          onClick={() => onSave({ ...config, editor: { lineNumbers } })}
          saving={saving}
          saved={saved}
        />
      </div>
    </div>
  );
}

// ── Profile Tab ──────────────────────────────────────────────

function ProfileTab() {
  const [profile, setProfile] = useState<CompScienceProfile>({
    company: '',
    address: '',
    signatory: '',
    title: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.laguz.getProfile().then((p) => {
      if (p) setProfile(p);
      setLoading(false);
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      await window.laguz.saveProfile(profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save profile:', e);
    } finally {
      setSaving(false);
    }
  }, [profile]);

  if (loading) {
    return <div className="text-xs text-text-muted">Loading...</div>;
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">Signing Profile</h3>
      <p className="text-[11px] text-text-muted mb-4">
        This information is used to auto-fill contract fields when Claude processes PDFs.
      </p>

      <div className="space-y-4">
        <SettingsField label="Company Name" description="Legal entity name for contracts">
          <input
            type="text"
            value={profile.company}
            onChange={(e) => setProfile(p => ({ ...p, company: e.target.value }))}
            className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary"
            placeholder="CompScience, Inc."
          />
        </SettingsField>

        <SettingsField label="Address" description="Company address for contracts">
          <textarea
            value={profile.address}
            onChange={(e) => setProfile(p => ({ ...p, address: e.target.value }))}
            className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary resize-none"
            rows={3}
            placeholder="123 Main St, Suite 100&#10;San Francisco, CA 94105"
          />
        </SettingsField>

        <SettingsField label="Signatory Name" description="Name of the person who signs contracts">
          <input
            type="text"
            value={profile.signatory}
            onChange={(e) => setProfile(p => ({ ...p, signatory: e.target.value }))}
            className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary"
            placeholder="Martin Stenkilde"
          />
        </SettingsField>

        <SettingsField label="Title" description="Official title for signature blocks">
          <input
            type="text"
            value={profile.title}
            onChange={(e) => setProfile(p => ({ ...p, title: e.target.value }))}
            className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary"
            placeholder="Director, Product & Business Development"
          />
        </SettingsField>

        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </div>
    </div>
  );
}

// ── API Tab ───────────────────────────────────────────────────

function ApiTab() {
  const [copiedEndpoints, setCopiedEndpoints] = useState(false);
  const port = 3144;

  const apiReference = `# Laguz API Reference
# Base URL: http://localhost:${port}
# All endpoints return JSON. POST requires Content-Type: application/json.

GET  /api/search?q=<query>&type=&company=&since=&tags=
GET  /api/note?path=<vault-relative-path>
GET  /api/recent?limit=50
GET  /api/meetings?company=<name>&since=
GET  /api/account?path=<folder-path>
GET  /api/folder?path=<folder-path>
GET  /api/subfolders?path=<parent-path>
GET  /api/unprocessed?since=
GET  /api/companies
POST /api/note  { "path": "...", "content": "..." }
`;

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">Local API Server</h3>
      <p className="text-xs text-text-muted mb-4">
        The API server is always running on port {port}. External tools and the MCP server use this to interact with your vault.
      </p>

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
          <div className="text-[9px] text-text-secondary font-semibold mt-1 mb-0.5 font-sans uppercase tracking-wider">Read</div>
          <div><span className="text-accent-primary">GET</span>  /api/search?q=...</div>
          <div><span className="text-accent-primary">GET</span>  /api/note?path=...</div>
          <div><span className="text-accent-primary">GET</span>  /api/recent?limit=50</div>
          <div><span className="text-accent-primary">GET</span>  /api/meetings?company=...</div>
          <div><span className="text-accent-primary">GET</span>  /api/account?path=...</div>
          <div><span className="text-accent-primary">GET</span>  /api/folder?path=...</div>
          <div><span className="text-accent-primary">GET</span>  /api/subfolders?path=...</div>
          <div><span className="text-accent-primary">GET</span>  /api/unprocessed</div>
          <div><span className="text-accent-primary">GET</span>  /api/companies</div>
          <div className="text-[9px] text-text-secondary font-semibold mt-2 mb-0.5 font-sans uppercase tracking-wider">Write</div>
          <div><span className="text-amber-400">POST</span> /api/note</div>
          <div className="text-[9px] text-text-secondary font-semibold mt-2 mb-0.5 font-sans uppercase tracking-wider">PDF</div>
          <div><span className="text-accent-primary">GET</span>  /api/pdf/text?path=...</div>
          <div><span className="text-accent-primary">GET</span>  /api/pdf/info?path=...</div>
          <div><span className="text-accent-primary">GET</span>  /api/pdf/fields?path=...</div>
          <div><span className="text-accent-primary">GET</span>  /api/pdf/sidecar?path=...</div>
          <div><span className="text-amber-400">POST</span> /api/pdf/annotate</div>
          <div><span className="text-amber-400">POST</span> /api/pdf/fill-field</div>
          <div><span className="text-amber-400">POST</span> /api/pdf/sign</div>
          <div><span className="text-amber-400">POST</span> /api/pdf/flatten</div>
          <div><span className="text-amber-400">POST</span> /api/pdf/sidecar</div>
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

function SaveButton({ onClick, saving, saved }: { onClick: () => void; saving: boolean; saved?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={`px-4 py-1.5 text-xs rounded-lg font-medium transition-colors ${
        saved
          ? 'bg-accent-primary/15 text-accent-primary'
          : 'bg-accent-primary hover:bg-accent-deep disabled:opacity-50 text-white'
      }`}
    >
      {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save'}
    </button>
  );
}
