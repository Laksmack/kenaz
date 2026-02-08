import React, { useState, useEffect, useCallback } from 'react';
import type { AppConfig } from '@shared/types';

interface Props {
  onClose: () => void;
}

type SettingsTab = 'general' | 'hubspot' | 'api' | 'signature';

export function SettingsModal({ onClose }: Props) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.kenaz.getConfig().then(setConfig);
  }, []);

  const handleSave = useCallback(async (updates: Partial<AppConfig>) => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await window.kenaz.setConfig(updates);
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save config:', e);
    } finally {
      setSaving(false);
    }
  }, []);

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
    { id: 'hubspot', label: 'HubSpot', icon: '🔗' },
    { id: 'api', label: 'API', icon: '🔌' },
    { id: 'signature', label: 'Signature', icon: '✍️' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-bg-secondary rounded-xl border border-border-subtle shadow-2xl w-[600px] max-h-[500px] flex overflow-hidden">
        {/* Sidebar tabs */}
        <div className="w-44 bg-bg-primary border-r border-border-subtle p-3 flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-text-primary px-3 py-2 mb-1">Settings</h2>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                activeTab === tab.id
                  ? 'bg-accent-primary/15 text-accent-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          <div className="px-3 py-2 text-[10px] text-text-muted">
            <kbd className="shortcut-key text-[9px]">⌥ ,</kbd> to toggle
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Save indicator */}
          {saved && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-accent-success/10 text-accent-success text-xs font-medium">
              Settings saved
            </div>
          )}

          {activeTab === 'general' && (
            <GeneralSettings config={config} onSave={handleSave} saving={saving} />
          )}
          {activeTab === 'hubspot' && (
            <HubSpotSettings config={config} onSave={handleSave} saving={saving} />
          )}
          {activeTab === 'api' && (
            <APISettings config={config} onSave={handleSave} saving={saving} />
          )}
          {activeTab === 'signature' && (
            <SignatureSettings config={config} onSave={handleSave} saving={saving} />
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
}

function GeneralSettings({ config, onSave, saving }: TabProps) {
  const [defaultView, setDefaultView] = useState(config.defaultView);

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-4">General</h3>
      <div className="space-y-4">
        <SettingsField label="Default View" description="Which view to show when the app opens">
          <select
            value={defaultView}
            onChange={(e) => setDefaultView(e.target.value as any)}
            className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary"
          >
            <option value="inbox">Inbox</option>
            <option value="pending">Pending</option>
            <option value="followup">Follow Up</option>
            <option value="sent">Sent</option>
            <option value="all">All Mail</option>
          </select>
        </SettingsField>
        <SaveButton onClick={() => onSave({ defaultView })} saving={saving} />
      </div>
    </div>
  );
}

function HubSpotSettings({ config, onSave, saving }: TabProps) {
  const [token, setToken] = useState(config.hubspotToken);

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">HubSpot Integration</h3>
      <p className="text-xs text-text-muted mb-4">
        Connect your HubSpot account to see CRM context in the sidebar and auto-log emails.
      </p>
      <div className="space-y-4">
        <SettingsField
          label="Private App Token"
          description="Create a private app in HubSpot → Settings → Integrations → Private Apps. Grant scopes: crm.objects.contacts.read, crm.objects.deals.read, crm.objects.companies.read"
        >
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary font-mono"
            placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </SettingsField>
        <div className="flex items-center gap-3">
          <SaveButton onClick={() => onSave({ hubspotToken: token })} saving={saving} />
          {config.hubspotToken && (
            <span className="text-xs text-accent-success flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-success" />
              Connected
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function APISettings({ config, onSave, saving }: TabProps) {
  const [port, setPort] = useState(config.apiPort);

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">Local API Server</h3>
      <p className="text-xs text-text-muted mb-4">
        The API server lets external tools (Claude Desktop, scripts) interact with your email. Restart required after changing port.
      </p>
      <div className="space-y-4">
        <SettingsField label="Port" description="The port the API server listens on (default: 3141)">
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(parseInt(e.target.value) || 3141)}
            className="w-32 bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary font-mono"
            min={1024}
            max={65535}
          />
        </SettingsField>

        <div className="p-3 rounded-lg bg-bg-primary border border-border-subtle">
          <div className="text-xs font-medium text-text-secondary mb-2">API Endpoints</div>
          <div className="space-y-1 text-[11px] font-mono text-text-muted">
            <div><span className="text-accent-success">GET</span>  http://localhost:{port}/api/inbox</div>
            <div><span className="text-accent-success">GET</span>  http://localhost:{port}/api/email/:id</div>
            <div><span className="text-accent-success">GET</span>  http://localhost:{port}/api/search?q=...</div>
            <div><span className="text-accent-primary">POST</span> http://localhost:{port}/api/send</div>
            <div><span className="text-accent-success">GET</span>  http://localhost:{port}/api/hubspot/contact/:email</div>
            <div><span className="text-accent-success">GET</span>  http://localhost:{port}/api/health</div>
          </div>
        </div>

        <SaveButton onClick={() => onSave({ apiPort: port })} saving={saving} />
      </div>
    </div>
  );
}

function SignatureSettings({ config, onSave, saving }: TabProps) {
  const [signature, setSignature] = useState(config.signature);

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">Email Signature</h3>
      <p className="text-xs text-text-muted mb-4">
        HTML signature appended to all outgoing emails.
      </p>
      <div className="space-y-4">
        <SettingsField label="Signature HTML">
          <textarea
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            className="w-full h-28 bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary font-mono resize-y"
            placeholder='<p style="color:#666;">Your Name<br/>Title</p>'
          />
        </SettingsField>

        {/* Preview */}
        <div className="p-3 rounded-lg bg-bg-primary border border-border-subtle">
          <div className="text-xs font-medium text-text-secondary mb-2">Preview</div>
          <div
            className="text-sm text-text-primary"
            dangerouslySetInnerHTML={{ __html: signature }}
          />
        </div>

        <SaveButton onClick={() => onSave({ signature })} saving={saving} />
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

function SaveButton({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="px-4 py-1.5 bg-accent-primary hover:bg-accent-deep disabled:opacity-50 text-white text-xs rounded-lg font-medium transition-colors"
    >
      {saving ? 'Saving...' : 'Save'}
    </button>
  );
}
