import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AppConfig, View, Rule, RuleCondition, RuleAction } from '@shared/types';

interface Props {
  onClose: () => void;
  onViewsChanged?: (views: View[]) => void;
  initialTab?: SettingsTab;
  prefillRule?: Partial<Rule>;
}

type SettingsTab = 'general' | 'views' | 'rules' | 'hubspot' | 'api' | 'signature';

export function SettingsModal({ onClose, onViewsChanged, initialTab, prefillRule }: Props) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'general');
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
    { id: 'views', label: 'Views', icon: '👁' },
    { id: 'rules', label: 'Rules', icon: '⚡' },
    { id: 'hubspot', label: 'HubSpot', icon: '🔗' },
    { id: 'api', label: 'API', icon: '🔌' },
    { id: 'signature', label: 'Signature', icon: '✍️' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-bg-secondary rounded-xl border border-border-subtle shadow-2xl w-[640px] max-h-[600px] flex overflow-hidden">
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
          {activeTab === 'views' && (
            <ViewsSettings onViewsChanged={onViewsChanged} />
          )}
          {activeTab === 'rules' && (
            <RulesSettings prefillRule={prefillRule} />
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
  const [viewOptions, setViewOptions] = useState<View[]>([]);
  useEffect(() => { window.kenaz.listViews().then(setViewOptions); }, []);
  const [inboxLabels, setInboxLabels] = useState(config.inboxLabels.join(', '));
  const [autoBccEnabled, setAutoBccEnabled] = useState(config.autoBccEnabled);
  const [autoBccAddress, setAutoBccAddress] = useState(config.autoBccAddress);
  const [autoBccExcludedDomains, setAutoBccExcludedDomains] = useState(
    config.autoBccExcludedDomains.join(', ')
  );

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
            {viewOptions.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </SettingsField>

        <SettingsField
          label="Inbox Labels"
          description="Additional Gmail labels to include in the Inbox view (comma-separated). E.g. CATEGORY_UPDATES, IMPORTANT"
        >
          <input
            type="text"
            value={inboxLabels}
            onChange={(e) => setInboxLabels(e.target.value)}
            className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary font-mono"
            placeholder="CATEGORY_UPDATES, IMPORTANT"
          />
        </SettingsField>

        <div className="border-t border-border-subtle pt-4">
          <h4 className="text-xs font-semibold text-text-primary mb-3">Auto BCC</h4>

          <div className="space-y-3">
            <SettingsField label="Enable Auto BCC" description="Automatically BCC an address on all outgoing emails (useful for HubSpot CRM logging)">
              <ToggleSwitch checked={autoBccEnabled} onChange={setAutoBccEnabled} />
            </SettingsField>

            {autoBccEnabled && (
              <>
                <SettingsField label="BCC Address" description="The email address to automatically BCC on outgoing mail">
                  <input
                    type="email"
                    value={autoBccAddress}
                    onChange={(e) => setAutoBccAddress(e.target.value)}
                    className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary font-mono"
                    placeholder="yourtoken@bcc.hubspot.com"
                  />
                </SettingsField>

                <SettingsField
                  label="Excluded Domains"
                  description="Skip auto-BCC when ALL recipients are on these domains (comma-separated). E.g. internal mail that doesn't need CRM logging."
                >
                  <input
                    type="text"
                    value={autoBccExcludedDomains}
                    onChange={(e) => setAutoBccExcludedDomains(e.target.value)}
                    className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary font-mono"
                    placeholder="compscience.com, yourdomain.com"
                  />
                </SettingsField>
              </>
            )}
          </div>
        </div>

        <SaveButton onClick={() => onSave({
          defaultView,
          inboxLabels: inboxLabels.split(',').map(s => s.trim()).filter(Boolean),
          autoBccEnabled,
          autoBccAddress: autoBccAddress.trim(),
          autoBccExcludedDomains: autoBccExcludedDomains.split(',').map(s => s.trim()).filter(Boolean),
        })} saving={saving} />
      </div>
    </div>
  );
}

function HubSpotSettings({ config, onSave, saving }: TabProps) {
  const [enabled, setEnabled] = useState(config.hubspotEnabled);
  const [token, setToken] = useState(config.hubspotToken);
  const [portalId, setPortalId] = useState(config.hubspotPortalId || '');

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">HubSpot Integration</h3>
      <p className="text-xs text-text-muted mb-4">
        Connect your HubSpot account to see CRM context in the sidebar.
        Restart required after changes.
      </p>
      <div className="space-y-4">
        <SettingsField label="Enable HubSpot" description="Show CRM contact info, deals, and activity in the sidebar">
          <ToggleSwitch checked={enabled} onChange={(v) => { setEnabled(v); onSave({ hubspotEnabled: v }); }} />
        </SettingsField>

        {enabled && (
          <>
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

            <SettingsField
              label="Portal ID"
              description="Your HubSpot account ID — find it in the URL when logged in (e.g. app.hubspot.com/contacts/12345678). Enables direct links to contacts and deals."
            >
              <input
                type="text"
                value={portalId}
                onChange={(e) => setPortalId(e.target.value)}
                className="w-48 bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary font-mono"
                placeholder="12345678"
              />
            </SettingsField>

            <div className="flex items-center gap-3">
              <SaveButton onClick={() => onSave({ hubspotToken: token, hubspotPortalId: portalId })} saving={saving} />
              {config.hubspotToken && (
                <span className="text-xs text-accent-success flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-success" />
                  Connected
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function APISettings({ config, onSave, saving }: TabProps) {
  const [enabled, setEnabled] = useState(config.apiEnabled);
  const [port, setPort] = useState(config.apiPort);
  const [copiedEndpoints, setCopiedEndpoints] = useState(false);

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">Local API Server</h3>
      <p className="text-xs text-text-muted mb-4">
        The API server lets external tools (Claude Desktop, scripts) interact with your email. Restart required after changes.
      </p>
      <div className="space-y-4">
        <SettingsField label="Enable API Server" description="Run a local HTTP server for external tool integration">
          <ToggleSwitch checked={enabled} onChange={(v) => { setEnabled(v); onSave({ apiEnabled: v }); }} />
        </SettingsField>

        {enabled && (
          <>
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
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-text-secondary">API Endpoints</div>
                <button
                  onClick={() => {
                    const base = `http://localhost:${port}`;
                    const doc = `# Kenaz API Reference
# Base URL: ${base}
# All endpoints return JSON. POST/DELETE require Content-Type: application/json.


# ═══════════════════════════════════════════════════════
# HEALTH & STATS
# ═══════════════════════════════════════════════════════

GET ${base}/api/health
# Response: { "status": "ok", "app": "kenaz", "version": "0.1.0" }

GET ${base}/api/stats
# Returns inbox counts for quick dashboard.
# Response: { "inbox": 23, "unread": 5, "starred": 2, "pending": 3, "followup": 7, "drafts": 2 }


# ═══════════════════════════════════════════════════════
# EMAIL: READ
# ═══════════════════════════════════════════════════════

GET ${base}/api/inbox
# Returns the 50 most recent inbox threads.
# Response: { "threads": [{ "id": "...", "subject": "...", "from": {...}, "snippet": "...", "lastDate": "...", "labels": [...], "isUnread": true }] }

GET ${base}/api/unread
# Returns unread inbox threads with count.
# Response: { "count": 5, "threads": [...] }

GET ${base}/api/email/:threadId
# Returns full thread with all messages, attachments, and HTML body.
# Example: GET ${base}/api/email/18e1a2b3c4d5e6f7
# Response: { "id": "...", "subject": "...", "messages": [{ "id": "...", "from": {...}, "to": [...], "date": "...", "body": "<html>...", "bodyText": "plain text...", "attachments": [{...}] }] }

GET ${base}/api/thread/:threadId/summary
# AI-ready thread summary. Strips HTML, extracts key info for drafting context.
# Response:
# {
#   "threadId": "...",
#   "subject": "Re: Pilot program update",
#   "participants": [
#     { "name": "Brett Johnson", "email": "brett@example.com", "role": "external" },
#     { "name": "Martin Stenkilde", "email": "martin@compscience.com", "role": "self" }
#   ],
#   "messageCount": 4,
#   "timeline": [
#     { "from": "Brett Johnson", "date": "2026-02-05T14:30:00Z", "snippet": "First 200 chars..." }
#   ],
#   "latestMessage": {
#     "from": "Brett Johnson",
#     "date": "2026-02-07T16:45:00Z",
#     "bodyText": "Full plain text of the most recent message"
#   },
#   "hasAttachments": true,
#   "labels": ["INBOX", "IMPORTANT"]
# }

GET ${base}/api/search?q=<gmail_query>
# Uses Gmail search syntax. Returns up to 50 threads.
# Examples:
#   GET ${base}/api/search?q=from:joe@example.com
#   GET ${base}/api/search?q=subject:invoice+after:2026/01/01
#   GET ${base}/api/search?q=has:attachment+filename:pdf
# Response: { "threads": [...] }


# ═══════════════════════════════════════════════════════
# EMAIL: SEND & DRAFTS
# ═══════════════════════════════════════════════════════

POST ${base}/api/send
# Send an email. Body uses markdown (converted to HTML automatically).
# Payload:
# {
#   "to": "recipient@example.com",          (required)
#   "subject": "Hello from Kenaz",          (required)
#   "body_markdown": "Hi,\\n\\n**Bold** text.", (required)
#   "cc": "cc@example.com",                 (optional)
#   "bcc": "bcc@example.com",               (optional)
#   "reply_to_thread_id": "thread_id",      (optional - makes it a reply)
#   "reply_to_message_id": "message_id",    (optional - In-Reply-To header)
#   "signature": true,                      (optional, default true)
#   "skip_auto_bcc": false                  (optional, default false)
# }
# Response: { "id": "msg_id", "threadId": "thread_id" }

POST ${base}/api/draft
# Create a draft. Same fields as send, all optional. Draft appears in Kenaz UI for review.
# Payload:
# {
#   "to": "recipient@example.com",
#   "subject": "Draft subject",
#   "body_markdown": "Review this before sending.",
#   "reply_to_thread_id": "thread_id_if_reply"
# }
# Response: { "draftId": "r123456789" }

GET ${base}/api/drafts
# List all drafts with metadata.
# Response: { "drafts": [{ "id": "r123...", "subject": "...", "to": "...", "snippet": "...", "date": "..." }] }

GET ${base}/api/draft/:draftId
# Get draft with full body content for editing.
# Response: { "id": "r123...", "to": "...", "cc": "...", "bcc": "...", "subject": "...", "body": "plain text...", "threadId": "...", "messageId": "..." }

DELETE ${base}/api/draft/:draftId
# Delete a draft.
# Response: { "success": true }


# ═══════════════════════════════════════════════════════
# EMAIL: LABELS & ACTIONS
# ═══════════════════════════════════════════════════════

GET ${base}/api/labels
# List all Gmail labels (system + custom). Useful for discovering available labels.
# Response: { "labels": [{ "id": "INBOX", "name": "INBOX", "type": "system" }, { "id": "Label_123", "name": "PENDING", "type": "user" }] }

POST ${base}/api/label/:threadId
# Add/remove labels from a thread.
# Payload: { "add": ["STARRED"], "remove": ["INBOX"] }
# Common labels: INBOX, STARRED, UNREAD, TRASH, SPAM, IMPORTANT
# Custom labels use IDs (get them from GET /api/labels)
# Response: { "success": true }

POST ${base}/api/archive/:threadId
# Convenience: removes INBOX label (archives the thread).
# No payload needed.
# Response: { "success": true }

POST ${base}/api/batch/archive
# Archive multiple threads in one call.
# Payload: { "threadIds": ["id1", "id2", "id3"] }
# Response: { "success": true, "archived": 3 }


# ═══════════════════════════════════════════════════════
# ATTACHMENTS
# ═══════════════════════════════════════════════════════

GET ${base}/api/attachment/:messageId/:attachmentId?filename=report.pdf
# Downloads attachment as binary file. Returns raw file with Content-Type and Content-Disposition headers.
# Get messageId and attachmentId from the thread/email endpoint's attachments array.


# ═══════════════════════════════════════════════════════
# HUBSPOT: CRM CONTEXT
# ═══════════════════════════════════════════════════════

GET ${base}/api/hubspot/contact/:email
# Full contact lookup with deals and recent activities.
# Example: GET ${base}/api/hubspot/contact/brett@example.com
# Response:
# {
#   "contact": { "id": "...", "email": "...", "firstName": "...", "lastName": "...", "company": "...", "title": "...", "phone": "..." },
#   "deals": [{ "id": "...", "name": "...", "stage": "Contract Sent", "amount": 100000, "closeDate": "2026-03-15" }],
#   "activities": [{ "id": "...", "type": "email", "body": "...", "timestamp": "..." }]
# }

GET ${base}/api/hubspot/deals
# List active deals. Optional filters: ?stage=qualification&owner=owner_id
# Response: { "deals": [{ "id": "...", "name": "Tesla - Annual Renewal", "stage": "Contract Sent", "amount": 100000, "closeDate": "2026-03-15" }] }

GET ${base}/api/hubspot/recent/:email
# Recent activities (emails, notes, meetings) for a contact. Optional: ?limit=5
# Response:
# {
#   "contact": { "name": "...", "email": "...", "company": "..." },
#   "activities": [
#     { "type": "email", "date": "...", "subject": "...", "body": "..." },
#     { "type": "note", "date": "...", "body": "..." },
#     { "type": "meeting", "date": "...", "title": "..." }
#   ]
# }


# ═══════════════════════════════════════════════════════
# COMBINED CONTEXT (THE KILLER ENDPOINT)
# ═══════════════════════════════════════════════════════

GET ${base}/api/context/:email
# One call = everything needed before drafting an email.
# Combines: HubSpot contact + deals + activities + last 5 email threads.
#
# Example: GET ${base}/api/context/brett@example.com
# Response:
# {
#   "contact": {
#     "name": "Brett Johnson",
#     "email": "brett@example.com",
#     "title": "VP Safety",
#     "company": "Mortenson",
#     "phone": "+1-555-0123"
#   },
#   "deals": [
#     { "id": "12345", "name": "Mortenson - Pilot", "stage": "Pilot Active", "amount": 85000, "closeDate": "2026-04-01" }
#   ],
#   "recentActivities": [
#     { "type": "email", "date": "2026-02-05", "subject": "Re: Pilot update" },
#     { "type": "note", "date": "2026-02-03", "body": "Expansion discussed..." }
#   ],
#   "recentThreads": [
#     { "threadId": "...", "subject": "Re: Pilot update", "lastDate": "...", "messageCount": 4, "latestSnippet": "...", "participants": [...] }
#   ]
# }


# ═══════════════════════════════════════════════════════
# VIEWS & RULES
# ═══════════════════════════════════════════════════════

GET ${base}/api/views
# List all views.
# Response: { "views": [{ "id": "inbox", "name": "Inbox", "icon": "📥", "query": "in:inbox" }, ...] }

POST ${base}/api/views
# Create a new view.
# Payload: { "id": "noise", "name": "Noise", "icon": "🔇", "query": "label:NOISE" }
# Response: { "views": [...] }

PUT ${base}/api/views/:id
# Update a view.
# Payload: { "name": "Updated Name", "query": "new query" }
# Response: { "views": [...] }

DELETE ${base}/api/views/:id
# Delete a view.
# Response: { "views": [...] }

GET ${base}/api/rules
# List all rules.
# Response: { "rules": [{ "id": "...", "name": "...", "enabled": true, "conditions": [...], "actions": [...] }] }

POST ${base}/api/rules
# Create a new rule.
# Payload:
# {
#   "id": "helpdesk_noise",
#   "name": "Helpdesk → Noise",
#   "enabled": true,
#   "conditions": [{ "field": "sender", "operator": "contains", "value": "helpdesk@company.com" }],
#   "actions": [{ "type": "remove_label", "label": "INBOX" }, { "type": "add_label", "label": "NOISE" }]
# }
# Condition fields: sender, to, cc, subject, body, label, has_attachment
# Condition operators: contains, equals, matches (regex), not_contains
# Action types: add_label, remove_label, archive, mark_read
# Response: { "rules": [...] }

PUT ${base}/api/rules/:id
# Update a rule.
# Response: { "rules": [...] }

DELETE ${base}/api/rules/:id
# Delete a rule.
# Response: { "rules": [...] }


# ═══════════════════════════════════════════════════════
# EXAMPLE WORKFLOWS
# ═══════════════════════════════════════════════════════

# ── Claude Workflow: Draft a contextual follow-up ─────
#
# Step 1: GET ${base}/api/context/brett@example.com
#         → Gets contact, deals, recent activity, email threads
#
# Step 2: GET ${base}/api/thread/<latestThreadId>/summary
#         → Gets full context of the most recent conversation
#
# Step 3: POST ${base}/api/draft
#         → Creates a contextual draft reply
#         → { "to": "brett@example.com", "subject": "Re: Pilot update",
#             "body_markdown": "Hi Brett, ...", "reply_to_thread_id": "..." }
#
# Step 4: User reviews in Kenaz UI, hits send
# Total API calls: 3 | Time: ~2 seconds

# ── curl Examples ─────────────────────────────────────

# Check health:
# curl ${base}/api/health

# Get inbox stats:
# curl ${base}/api/stats

# Get unread emails:
# curl ${base}/api/unread

# Get full context before drafting:
# curl ${base}/api/context/brett@example.com

# Get AI-ready thread summary:
# curl ${base}/api/thread/THREAD_ID/summary

# Send an email:
# curl -X POST ${base}/api/send -H "Content-Type: application/json" \\
#   -d '{"to":"test@example.com","subject":"Test","body_markdown":"Hello!"}'

# Create a draft for review:
# curl -X POST ${base}/api/draft -H "Content-Type: application/json" \\
#   -d '{"to":"test@example.com","subject":"Draft","body_markdown":"Review me"}'

# Archive a thread:
# curl -X POST ${base}/api/archive/THREAD_ID

# Batch archive:
# curl -X POST ${base}/api/batch/archive -H "Content-Type: application/json" \\
#   -d '{"threadIds":["id1","id2","id3"]}'

# List all labels:
# curl ${base}/api/labels

# Search emails:
# curl "${base}/api/search?q=is:unread+from:brett@example.com"

# List active HubSpot deals:
# curl ${base}/api/hubspot/deals

# Download attachment:
# curl -o report.pdf "${base}/api/attachment/MSG_ID/ATT_ID?filename=report.pdf"
`;
                    navigator.clipboard.writeText(doc);
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
                <div className="text-[9px] text-text-secondary font-semibold mt-1 mb-0.5 font-sans uppercase tracking-wider">Core</div>
                <div><span className="text-accent-success">GET</span>  /api/health</div>
                <div><span className="text-accent-success">GET</span>  /api/stats</div>
                <div><span className="text-accent-success">GET</span>  /api/inbox</div>
                <div><span className="text-accent-success">GET</span>  /api/unread</div>
                <div><span className="text-accent-success">GET</span>  /api/email/:id</div>
                <div><span className="text-accent-success">GET</span>  /api/thread/:id/summary</div>
                <div><span className="text-accent-success">GET</span>  /api/search?q=...</div>
                <div className="text-[9px] text-text-secondary font-semibold mt-2 mb-0.5 font-sans uppercase tracking-wider">Send & Drafts</div>
                <div><span className="text-accent-primary">POST</span> /api/send</div>
                <div><span className="text-accent-primary">POST</span> /api/draft</div>
                <div><span className="text-accent-success">GET</span>  /api/drafts</div>
                <div><span className="text-accent-success">GET</span>  /api/draft/:id</div>
                <div><span className="text-accent-danger">DEL</span>  /api/draft/:id</div>
                <div className="text-[9px] text-text-secondary font-semibold mt-2 mb-0.5 font-sans uppercase tracking-wider">Actions</div>
                <div><span className="text-accent-success">GET</span>  /api/labels</div>
                <div><span className="text-accent-primary">POST</span> /api/label/:id</div>
                <div><span className="text-accent-primary">POST</span> /api/archive/:id</div>
                <div><span className="text-accent-primary">POST</span> /api/batch/archive</div>
                <div><span className="text-accent-success">GET</span>  /api/attachment/:msgId/:attId</div>
                <div className="text-[9px] text-text-secondary font-semibold mt-2 mb-0.5 font-sans uppercase tracking-wider">Views & Rules</div>
                <div><span className="text-accent-success">GET</span>  /api/views</div>
                <div><span className="text-accent-primary">POST</span> /api/views</div>
                <div><span className="text-accent-warning">PUT</span>  /api/views/:id</div>
                <div><span className="text-accent-danger">DEL</span>  /api/views/:id</div>
                <div><span className="text-accent-success">GET</span>  /api/rules</div>
                <div><span className="text-accent-primary">POST</span> /api/rules</div>
                <div><span className="text-accent-warning">PUT</span>  /api/rules/:id</div>
                <div><span className="text-accent-danger">DEL</span>  /api/rules/:id</div>
                <div className="text-[9px] text-text-secondary font-semibold mt-2 mb-0.5 font-sans uppercase tracking-wider">HubSpot & Context</div>
                <div><span className="text-accent-success">GET</span>  /api/context/:email</div>
                <div><span className="text-accent-success">GET</span>  /api/hubspot/contact/:email</div>
                <div><span className="text-accent-success">GET</span>  /api/hubspot/deals</div>
                <div><span className="text-accent-success">GET</span>  /api/hubspot/recent/:email</div>
              </div>
            </div>

            <SaveButton onClick={() => onSave({ apiPort: port })} saving={saving} />
          </>
        )}
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

// ── Views Settings ────────────────────────────────────────────

function ViewsSettings({ onViewsChanged }: { onViewsChanged?: (views: View[]) => void }) {
  const [views, setViews] = useState<View[]>([]);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.kenaz.listViews().then(setViews);
  }, []);

  const handleSave = async (updated: View[]) => {
    setSaving(true);
    try {
      const result = await window.kenaz.saveViews(updated);
      setViews(result);
      onViewsChanged?.(result);
    } catch (e) {
      console.error('Failed to save views:', e);
    }
    setSaving(false);
  };

  const handleMove = (idx: number, dir: -1 | 1) => {
    const next = [...views];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    handleSave(next);
  };

  const handleDelete = (idx: number) => {
    const next = views.filter((_, i) => i !== idx);
    handleSave(next);
  };

  const handleAdd = () => {
    const id = `custom_${Date.now()}`;
    const newView: View = { id, name: 'New View', query: 'label:INBOX', icon: '📁' };
    const next = [...views, newView];
    setViews(next);
    setEditIdx(next.length - 1);
  };

  const handleUpdate = (idx: number, updates: Partial<View>) => {
    const next = views.map((v, i) => (i === idx ? { ...v, ...updates } : v));
    setViews(next);
  };

  const handleSaveEdit = () => {
    setEditIdx(null);
    handleSave(views);
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">Views</h3>
      <p className="text-xs text-text-muted mb-4">
        Named sidebar items. Each view displays emails matching a Gmail query.
      </p>

      <div className="space-y-1 mb-3">
        {views.map((view, idx) => (
          <div key={view.id} className="flex items-center gap-2 p-2 rounded-lg bg-bg-primary border border-border-subtle group">
            {editIdx === idx ? (
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <input
                    className="w-10 bg-bg-secondary border border-border-subtle rounded px-1.5 py-1 text-xs text-text-primary text-center outline-none focus:border-accent-primary"
                    value={view.icon || ''}
                    onChange={(e) => handleUpdate(idx, { icon: e.target.value })}
                    placeholder="📁"
                    maxLength={2}
                  />
                  <input
                    className="flex-1 bg-bg-secondary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary"
                    value={view.name}
                    onChange={(e) => handleUpdate(idx, { name: e.target.value })}
                    placeholder="View name"
                  />
                </div>
                <input
                  className="w-full bg-bg-secondary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary font-mono"
                  value={view.query}
                  onChange={(e) => handleUpdate(idx, { query: e.target.value })}
                  placeholder="Gmail search query (e.g. label:NOISE)"
                />
                <div className="flex gap-2">
                  <button onClick={handleSaveEdit} className="px-2 py-1 text-[10px] bg-accent-primary text-white rounded font-medium">Done</button>
                  <button onClick={() => setEditIdx(null)} className="px-2 py-1 text-[10px] text-text-muted rounded hover:text-text-primary">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <span className="text-sm w-6 text-center">{view.icon || '📁'}</span>
                <span className="text-xs text-text-primary font-medium flex-1">{view.name}</span>
                <span className="text-[10px] text-text-muted font-mono truncate max-w-[150px]">{view.query}</span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleMove(idx, -1)} className="p-0.5 text-text-muted hover:text-text-primary text-xs" title="Move up">▲</button>
                  <button onClick={() => handleMove(idx, 1)} className="p-0.5 text-text-muted hover:text-text-primary text-xs" title="Move down">▼</button>
                  <button onClick={() => setEditIdx(idx)} className="p-0.5 text-text-muted hover:text-text-primary text-xs" title="Edit">✏️</button>
                  <button onClick={() => handleDelete(idx)} className="p-0.5 text-text-muted hover:text-accent-danger text-xs" title="Delete">✕</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleAdd}
        className="px-3 py-1.5 text-xs text-accent-primary hover:bg-accent-primary/10 rounded-lg font-medium transition-colors"
      >
        + Add View
      </button>
    </div>
  );
}

// ── Rules Settings ────────────────────────────────────────────

function RulesSettings({ prefillRule }: { prefillRule?: Partial<Rule> }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const prefillApplied = useRef(false);

  useEffect(() => {
    window.kenaz.listRules().then((loaded) => {
      setRules(loaded);
      // If we have a prefill rule, add it and open for editing
      if (prefillRule && !prefillApplied.current) {
        prefillApplied.current = true;
        const newRule: Rule = {
          id: prefillRule.id || `rule_${Date.now()}`,
          name: prefillRule.name || 'New Rule',
          enabled: prefillRule.enabled ?? true,
          conditions: prefillRule.conditions || [{ field: 'sender', operator: 'contains', value: '' }],
          actions: prefillRule.actions || [{ type: 'archive' }],
        };
        const next = [...loaded, newRule];
        setRules(next);
        setEditIdx(next.length - 1);
      }
    });
  }, []);

  const handleSave = async (updated: Rule[]) => {
    setSaving(true);
    try {
      const result = await window.kenaz.saveRules(updated);
      setRules(result);
    } catch (e) {
      console.error('Failed to save rules:', e);
    }
    setSaving(false);
  };

  const handleToggle = (idx: number) => {
    const next = rules.map((r, i) => (i === idx ? { ...r, enabled: !r.enabled } : r));
    handleSave(next);
  };

  const handleDelete = (idx: number) => {
    handleSave(rules.filter((_, i) => i !== idx));
  };

  const handleAdd = () => {
    const id = `rule_${Date.now()}`;
    const newRule: Rule = {
      id,
      name: 'New Rule',
      enabled: true,
      conditions: [{ field: 'sender', operator: 'contains', value: '' }],
      actions: [{ type: 'archive' }],
    };
    const next = [...rules, newRule];
    setRules(next);
    setEditIdx(next.length - 1);
  };

  const handleUpdateRule = (idx: number, updates: Partial<Rule>) => {
    setRules(rules.map((r, i) => (i === idx ? { ...r, ...updates } : r)));
  };

  const handleSaveEdit = () => {
    setEditIdx(null);
    handleSave(rules);
  };

  const conditionFields: RuleCondition['field'][] = ['sender', 'to', 'cc', 'subject', 'body', 'label', 'has_attachment'];
  const conditionOps: RuleCondition['operator'][] = ['contains', 'equals', 'matches', 'not_contains'];
  const actionTypes: RuleAction['type'][] = ['add_label', 'remove_label', 'archive', 'mark_read'];

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">Rules</h3>
      <p className="text-xs text-text-muted mb-4">
        Auto-applied to incoming mail. All conditions must match (AND). Multiple rules can match.
      </p>

      <div className="space-y-2 mb-3">
        {rules.map((rule, idx) => (
          <div key={rule.id} className="p-2.5 rounded-lg bg-bg-primary border border-border-subtle">
            {editIdx === idx ? (
              <div className="space-y-3">
                <input
                  className="w-full bg-bg-secondary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary"
                  value={rule.name}
                  onChange={(e) => handleUpdateRule(idx, { name: e.target.value })}
                  placeholder="Rule name"
                />

                <div>
                  <div className="text-[10px] text-text-secondary font-semibold uppercase tracking-wider mb-1">Conditions (all must match)</div>
                  {rule.conditions.map((cond, ci) => (
                    <div key={ci} className="flex gap-1 mb-1">
                      <select
                        className="bg-bg-secondary border border-border-subtle rounded px-1 py-0.5 text-[10px] text-text-primary outline-none"
                        value={cond.field}
                        onChange={(e) => {
                          const next = [...rule.conditions];
                          next[ci] = { ...next[ci], field: e.target.value as any };
                          handleUpdateRule(idx, { conditions: next });
                        }}
                      >
                        {conditionFields.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <select
                        className="bg-bg-secondary border border-border-subtle rounded px-1 py-0.5 text-[10px] text-text-primary outline-none"
                        value={cond.operator}
                        onChange={(e) => {
                          const next = [...rule.conditions];
                          next[ci] = { ...next[ci], operator: e.target.value as any };
                          handleUpdateRule(idx, { conditions: next });
                        }}
                      >
                        {conditionOps.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <input
                        className="flex-1 bg-bg-secondary border border-border-subtle rounded px-1.5 py-0.5 text-[10px] text-text-primary outline-none focus:border-accent-primary font-mono"
                        value={cond.value}
                        onChange={(e) => {
                          const next = [...rule.conditions];
                          next[ci] = { ...next[ci], value: e.target.value };
                          handleUpdateRule(idx, { conditions: next });
                        }}
                        placeholder="value"
                      />
                      <button
                        onClick={() => {
                          const next = rule.conditions.filter((_, i) => i !== ci);
                          handleUpdateRule(idx, { conditions: next.length ? next : [{ field: 'sender', operator: 'contains', value: '' }] });
                        }}
                        className="text-text-muted hover:text-accent-danger text-xs px-1"
                      >✕</button>
                    </div>
                  ))}
                  <button
                    onClick={() => handleUpdateRule(idx, { conditions: [...rule.conditions, { field: 'sender', operator: 'contains', value: '' }] })}
                    className="text-[10px] text-accent-primary hover:underline"
                  >+ condition</button>
                </div>

                <div>
                  <div className="text-[10px] text-text-secondary font-semibold uppercase tracking-wider mb-1">Actions</div>
                  {rule.actions.map((act, ai) => (
                    <div key={ai} className="flex gap-1 mb-1">
                      <select
                        className="bg-bg-secondary border border-border-subtle rounded px-1 py-0.5 text-[10px] text-text-primary outline-none"
                        value={act.type}
                        onChange={(e) => {
                          const next = [...rule.actions];
                          next[ai] = { ...next[ai], type: e.target.value as any };
                          handleUpdateRule(idx, { actions: next });
                        }}
                      >
                        {actionTypes.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                      {(act.type === 'add_label' || act.type === 'remove_label') && (
                        <input
                          className="flex-1 bg-bg-secondary border border-border-subtle rounded px-1.5 py-0.5 text-[10px] text-text-primary outline-none focus:border-accent-primary font-mono"
                          value={act.label || ''}
                          onChange={(e) => {
                            const next = [...rule.actions];
                            next[ai] = { ...next[ai], label: e.target.value };
                            handleUpdateRule(idx, { actions: next });
                          }}
                          placeholder="LABEL_NAME"
                        />
                      )}
                      <button
                        onClick={() => {
                          const next = rule.actions.filter((_, i) => i !== ai);
                          handleUpdateRule(idx, { actions: next.length ? next : [{ type: 'archive' }] });
                        }}
                        className="text-text-muted hover:text-accent-danger text-xs px-1"
                      >✕</button>
                    </div>
                  ))}
                  <button
                    onClick={() => handleUpdateRule(idx, { actions: [...rule.actions, { type: 'archive' }] })}
                    className="text-[10px] text-accent-primary hover:underline"
                  >+ action</button>
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={handleSaveEdit} className="px-2 py-1 text-[10px] bg-accent-primary text-white rounded font-medium">Done</button>
                  <button onClick={() => setEditIdx(null)} className="px-2 py-1 text-[10px] text-text-muted rounded hover:text-text-primary">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <ToggleSwitch checked={rule.enabled} onChange={() => handleToggle(idx)} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-primary font-medium">{rule.name}</div>
                  <div className="text-[10px] text-text-muted truncate">
                    {rule.conditions.map((c) => `${c.field} ${c.operator} "${c.value}"`).join(' AND ')}
                    {' → '}
                    {rule.actions.map((a) => a.type === 'add_label' || a.type === 'remove_label' ? `${a.type.replace('_', ' ')} ${a.label}` : a.type.replace('_', ' ')).join(', ')}
                  </div>
                </div>
                <button onClick={() => setEditIdx(idx)} className="p-0.5 text-text-muted hover:text-text-primary text-xs opacity-0 group-hover:opacity-100" title="Edit">✏️</button>
                <button onClick={() => handleDelete(idx)} className="p-0.5 text-text-muted hover:text-accent-danger text-xs" title="Delete">✕</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleAdd}
        className="px-3 py-1.5 text-xs text-accent-primary hover:bg-accent-primary/10 rounded-lg font-medium transition-colors"
      >
        + Add Rule
      </button>

      <p className="text-[10px] text-text-muted mt-4">
        Rules run client-side when new mail is fetched. Power users can edit the JSON directly at<br />
        <span className="font-mono">~/Library/Application Support/kenaz/rules.json</span>
      </p>
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
