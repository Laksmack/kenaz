import React, { useMemo, useState, useEffect } from 'react';
import type { EmailThread } from '@shared/types';
import { useHubSpot } from '../hooks/useHubSpot';
import { CalendarWidget } from './CalendarWidget';
import { CalendarInviteContext } from './CalendarInviteContext';
import { detectCalendarInvite } from '../lib/detectInvite';
import { formatRelativeDate } from '../lib/utils';

interface Props {
  thread: EmailThread | null;
  hubspotEnabled?: boolean;
  hubspotPortalId?: string;
}

function hubspotContactUrl(portalId: string, contactId: string) {
  return `https://app.hubspot.com/contacts/${portalId}/contact/${contactId}`;
}

function hubspotDealUrl(portalId: string, dealId: string) {
  return `https://app.hubspot.com/contacts/${portalId}/record/0-3/${dealId}`;
}

/**
 * Resolve invite info from a thread: detect the invite, look up the event,
 * and extract the time window for the conflict preview.
 */
function useInviteInfo(thread: EmailThread | null) {
  const detection = useMemo(() => {
    if (!thread?.messages?.length) return null;
    // Check the newest message first, then fall back through older messages
    for (let i = thread.messages.length - 1; i >= 0; i--) {
      const result = detectCalendarInvite(thread.messages[i]);
      if (result.isInvite) return result;
    }
    return null;
  }, [thread?.id]);

  const [inviteInfo, setInviteInfo] = useState<{
    summary: string;
    start: Date;
    end: Date;
    eventId: string | null;
  } | null>(null);

  useEffect(() => {
    if (!detection?.isInvite) {
      setInviteInfo(null);
      return;
    }

    let cancelled = false;
    const summary = detection.parsedSummary
      || thread?.subject?.replace(/^(Re|Fwd|Updated\s+)?Invitation:\s*/i, '').replace(/@.*$/, '').trim()
      || 'Calendar Invite';

    (async () => {
      // Resolve eventId from Dagaz for accurate conflict matching
      let eventId: string | null = null;
      if (detection.iCalUID) {
        try {
          eventId = await window.kenaz.calendarFindEvent(detection.iCalUID);
        } catch {
          // Dagaz not running or event not found
        }
      }

      // If we parsed the time from the email body, use it directly
      if (detection.parsedTime) {
        if (!cancelled) {
          setInviteInfo({
            summary,
            start: detection.parsedTime.start,
            end: detection.parsedTime.end,
            eventId,
          });
        }
        return;
      }

      // No parsed time — try to find the event in Dagaz within a narrow range
      if (eventId) {
        try {
          const rangeStart = new Date();
          rangeStart.setDate(rangeStart.getDate() - 7);
          rangeStart.setHours(0, 0, 0, 0);
          const rangeEnd = new Date();
          rangeEnd.setDate(rangeEnd.getDate() + 28);
          rangeEnd.setHours(23, 59, 59, 999);

          const events = await window.kenaz.calendarRange(rangeStart.toISOString(), rangeEnd.toISOString());
          const match = events.find((e: any) => e.id === eventId);
          if (match && !cancelled) {
            setInviteInfo({
              summary: match.summary || summary,
              start: new Date(match.start),
              end: new Date(match.end),
              eventId,
            });
            return;
          }
        } catch {
          // Dagaz not running
        }
      }

      if (!cancelled) setInviteInfo(null);
    })();

    return () => { cancelled = true; };
  }, [detection, thread?.id]);

  return { isInvite: !!detection?.isInvite, inviteInfo };
}

export function Sidebar({ thread, hubspotEnabled = false, hubspotPortalId = '' }: Props) {
  const senderEmail = hubspotEnabled ? (thread?.from?.email || null) : null;
  const hubspot = useHubSpot(senderEmail);
  const { isInvite, inviteInfo } = useInviteInfo(thread);

  if (!thread) {
    return (
      <div className="h-full flex flex-col overflow-y-auto scrollbar-hide">
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
      {/* Calendar: show invite context when viewing an invite, otherwise normal widget */}
      <div className="border-b border-border-subtle">
        {inviteInfo ? (
          <CalendarInviteContext invite={inviteInfo} />
        ) : (
          <CalendarWidget enabled={true} />
        )}
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

        {!hubspot.loading && !hubspot.contact && !hubspot.error && hubspotEnabled && (
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
            <a
              href={hubspotPortalId ? hubspotContactUrl(hubspotPortalId, hubspot.contact.id) : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-3 mb-3 group ${hubspotPortalId ? 'cursor-pointer' : ''}`}
              onClick={(e) => { if (!hubspotPortalId) e.preventDefault(); }}
            >
              <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center text-sm font-semibold text-text-secondary flex-shrink-0">
                {hubspot.contact.firstName?.[0] || hubspot.contact.email[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-medium truncate ${hubspotPortalId ? 'text-text-primary group-hover:text-[#ff7a59]' : 'text-text-primary'} transition-colors`}>
                    {hubspot.contact.firstName} {hubspot.contact.lastName}
                  </span>
                  {hubspotPortalId && (
                    <svg className="w-3 h-3 flex-shrink-0 text-text-muted group-hover:text-[#ff7a59] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  )}
                </div>
                <div className="text-xs text-text-muted">{hubspot.contact.title}</div>
              </div>
            </a>
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
              {hubspot.deals.map((deal) => {
                const DealWrapper = hubspotPortalId ? 'a' : 'div';
                const wrapperProps = hubspotPortalId ? {
                  href: hubspotDealUrl(hubspotPortalId, deal.id),
                  target: '_blank' as const,
                  rel: 'noopener noreferrer',
                } : {};
                return (
                  <DealWrapper
                    key={deal.id}
                    {...wrapperProps}
                    className={`block p-2 rounded bg-bg-primary group no-underline ${hubspotPortalId ? 'hover:bg-bg-hover cursor-pointer' : ''} transition-colors`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className={`text-xs font-medium truncate flex-1 ${hubspotPortalId ? 'text-text-primary group-hover:text-[#ff7a59]' : 'text-text-primary'} transition-colors`}>
                        {deal.name}
                      </div>
                      {hubspotPortalId && (
                        <svg className="w-3 h-3 flex-shrink-0 ml-2 text-text-muted group-hover:text-[#ff7a59] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      )}
                    </div>
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
                  </DealWrapper>
                );
              })}
            </div>
          </div>
        )}

        {/* Open in HubSpot — when contact exists but no deals, nudge user to link in HubSpot */}
        {hubspot.contact && hubspot.deals.length === 0 && hubspotPortalId && (
          <div className="sidebar-section">
            <a
              href={hubspotContactUrl(hubspotPortalId, hubspot.contact.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-[#ff7a59] hover:text-[#ff5c35] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open in HubSpot to link deals
            </a>
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
        <ShortcutRow keys="E/D" label="Done" />
        <ShortcutRow keys="P" label="Pending" />
        <ShortcutRow keys="T" label="Todo" />
        <ShortcutRow keys="S" label="Star" />
        <ShortcutRow keys="F" label="Forward" />
        <ShortcutRow keys="C" label="Compose" />
        <ShortcutRow keys="R" label="Reply" />
        <ShortcutRow keys="J/K" label="Navigate" />
        <ShortcutRow keys="Z+N" label="Snooze N days" />
        <ShortcutRow keys="/" label="Adv. Search" />
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
