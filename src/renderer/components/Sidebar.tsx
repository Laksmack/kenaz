import React from 'react';
import type { EmailThread } from '@shared/types';
import { useHubSpot } from '../hooks/useHubSpot';
import { CalendarWidget } from './CalendarWidget';
import { formatRelativeDate } from '../lib/utils';

interface Props {
  thread: EmailThread | null;
}

export function Sidebar({ thread }: Props) {
  const senderEmail = thread?.from?.email || null;
  const hubspot = useHubSpot(senderEmail);

  if (!thread) {
    return (
      <div className="h-full flex flex-col overflow-y-auto scrollbar-hide">
        {/* Calendar always visible */}
        <div className="border-b border-border-subtle">
          <CalendarWidget enabled={true} />
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-text-muted text-center">Select an email to see CRM context</p>
        </div>
        <ShortcutsHelp />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto scrollbar-hide">
      {/* Calendar always at top */}
      <div className="border-b border-border-subtle">
        <CalendarWidget enabled={true} />
      </div>

      <div className="flex-1 p-3 space-y-3">
        {hubspot.loading && (
          <div className="text-xs text-text-muted text-center py-4">Looking up contact...</div>
        )}

        {hubspot.error && (
          <div className="sidebar-section border border-accent-danger/20">
            <div className="text-xs text-accent-danger">{hubspot.error}</div>
          </div>
        )}

        {!hubspot.loading && !hubspot.contact && !hubspot.error && (
          <div className="sidebar-section">
            <div className="text-xs text-text-muted text-center">
              <div className="mb-1">No HubSpot contact found</div>
              <div className="text-text-muted/60">{senderEmail}</div>
            </div>
          </div>
        )}

        {/* Contact Card */}
        {hubspot.contact && (
          <div className="sidebar-section">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center text-sm font-semibold text-text-secondary">
                {hubspot.contact.firstName?.[0] || hubspot.contact.email[0]?.toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-medium text-text-primary">
                  {hubspot.contact.firstName} {hubspot.contact.lastName}
                </div>
                <div className="text-xs text-text-muted">{hubspot.contact.title}</div>
              </div>
            </div>
            <div className="space-y-1.5 text-xs">
              {hubspot.contact.company && (
                <DetailRow label="Company" value={hubspot.contact.company} />
              )}
              {hubspot.contact.email && (
                <DetailRow label="Email" value={hubspot.contact.email} />
              )}
              {hubspot.contact.phone && (
                <DetailRow label="Phone" value={hubspot.contact.phone} />
              )}
              {hubspot.contact.lastActivity && (
                <DetailRow label="Last Activity" value={formatRelativeDate(hubspot.contact.lastActivity)} />
              )}
            </div>
          </div>
        )}

        {/* Deals */}
        {hubspot.deals.length > 0 && (
          <div className="sidebar-section">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Deals</h4>
            <div className="space-y-2">
              {hubspot.deals.map((deal) => (
                <div key={deal.id} className="p-2 rounded bg-bg-primary">
                  <div className="text-xs font-medium text-text-primary mb-1">{deal.name}</div>
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span className="px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary text-[10px]">
                      {deal.stage}
                    </span>
                    {deal.amount > 0 && (
                      <span className="font-mono text-accent-success">
                        ${deal.amount.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {deal.closeDate && (
                    <div className="text-[10px] text-text-muted mt-1">
                      Close: {new Date(deal.closeDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activities */}
        {hubspot.activities.length > 0 && (
          <div className="sidebar-section">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Recent Activity</h4>
            <div className="space-y-2">
              {hubspot.activities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-2">
                  <span className="text-xs text-text-muted mt-0.5">
                    {activity.type === 'email' ? '📧' : activity.type === 'meeting' ? '📅' : activity.type === 'call' ? '📞' : '📝'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-text-secondary truncate">
                      {activity.body || activity.subject || 'No description'}
                    </div>
                    <div className="text-[10px] text-text-muted">
                      {formatRelativeDate(activity.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ShortcutsHelp />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-text-muted flex-shrink-0">{label}</span>
      <span className="text-text-secondary truncate text-right">{value}</span>
    </div>
  );
}

function ShortcutsHelp() {
  return (
    <div className="p-3 border-t border-border-subtle">
      <h4 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Shortcuts</h4>
      <div className="grid grid-cols-2 gap-1 text-[10px]">
        <ShortcutRow keys="E/D" label="Archive" />
        <ShortcutRow keys="P" label="Pending" />
        <ShortcutRow keys="F" label="Follow Up" />
        <ShortcutRow keys="C" label="Compose" />
        <ShortcutRow keys="R" label="Reply" />
        <ShortcutRow keys="J/K" label="Navigate" />
        <ShortcutRow keys="/" label="Search" />
        <ShortcutRow keys="Esc" label="Back" />
      </div>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <kbd className="shortcut-key text-[9px] w-auto px-1">{keys}</kbd>
      <span className="text-text-muted">{label}</span>
    </div>
  );
}
