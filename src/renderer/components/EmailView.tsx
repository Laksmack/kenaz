import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { EmailThread, Email } from '@shared/types';
import { formatFullDate } from '../lib/utils';

function decodeHtmlEntities(text: string): string {
  const el = document.createElement('textarea');
  el.innerHTML = text;
  return el.value;
}

/**
 * Detect if an email is a calendar invite.
 * Gmail calendar invites typically:
 * - Have an .ics attachment
 * - Come from calendar-notification@google.com
 * - Contain "VCALENDAR" or "invitation" references
 * Returns the iCalUID if detectable, or true for generic invite detection.
 */
function detectCalendarInvite(message: Email): { isInvite: boolean; iCalUID: string | null } {
  // Check for .ics attachments
  const hasIcs = message.attachments.some((a) =>
    a.filename.endsWith('.ics') || a.mimeType === 'text/calendar' || a.mimeType === 'application/ics'
  );

  // Check if it's from Google Calendar
  const isCalendarNotification = message.from.email.includes('calendar-notification@google.com') ||
    message.from.email.includes('calendar@google.com');

  // Try to extract iCalUID from body text or HTML
  // Google Calendar invites embed the event info in the email body
  let iCalUID: string | null = null;
  const bodyContent = message.body + ' ' + message.bodyText;

  // Look for Google Calendar event patterns in links
  // e.g., https://calendar.google.com/calendar/event?eid=XXXXX
  const eidMatch = bodyContent.match(/calendar\.google\.com\/calendar\/event\?.*?eid=([A-Za-z0-9_-]+)/);
  if (eidMatch) {
    // The eid is a base64-encoded string containing the event ID
    try {
      const decoded = atob(eidMatch[1].replace(/-/g, '+').replace(/_/g, '/'));
      // Format: "eventId calendarEmail" — we want just the eventId
      const eventId = decoded.split(' ')[0];
      if (eventId) iCalUID = eventId;
    } catch {
      // ignore decode errors
    }
  }

  // Check for invite keywords in subject/body
  const hasInviteKeywords = message.subject.toLowerCase().includes('invitation:') ||
    message.subject.toLowerCase().includes('updated invitation:') ||
    bodyContent.includes('VCALENDAR') ||
    bodyContent.includes('BEGIN:VEVENT');

  const isInvite = hasIcs || isCalendarNotification || hasInviteKeywords;

  return { isInvite, iCalUID };
}

interface Props {
  thread: EmailThread | null;
  onReply: () => void;
  onArchive: () => void;
  onLabel: (label: string) => void;
  onStar: () => void;
  onDeleteDraft?: (thread: EmailThread) => void;
}

export function EmailView({ thread, onReply, onArchive, onLabel, onStar, onDeleteDraft }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const [labelMap, setLabelMap] = useState<Record<string, string>>({});

  // Load label name map when details panel is opened
  useEffect(() => {
    if (!showDetails) return;
    window.kenaz.listLabels().then((labels) => {
      const map: Record<string, string> = {};
      for (const l of labels) {
        if (l.id !== l.name) map[l.id] = l.name;
      }
      setLabelMap(map);
    }).catch(() => {});
  }, [showDetails]);

  // Resolve a label ID to its human-readable name
  const labelName = (id: string) => labelMap[id] ? `${labelMap[id]}` : id;

  // Global focus guardian: whenever an iframe steals focus, reclaim it for the main document.
  // This ensures keyboard shortcuts always work regardless of where the user clicks.
  useEffect(() => {
    const reclaimFocus = () => {
      // If active element is an iframe, blur it so keyboard events go to the main window
      if (document.activeElement?.tagName === 'IFRAME') {
        (document.activeElement as HTMLElement).blur();
      }
    };

    // Check focus periodically (catches iframe focus grabs after content loads)
    const interval = setInterval(reclaimFocus, 300);

    // Also catch direct focus shifts
    window.addEventListener('blur', () => {
      // When the main window loses focus to an iframe, reclaim it after a tick
      setTimeout(reclaimFocus, 50);
    });

    return () => clearInterval(interval);
  }, []);

  if (!thread) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-text-muted">
          <div className="text-4xl mb-3 opacity-30">📧</div>
          <div className="text-sm">Select an email to read</div>
          <div className="text-xs mt-2 space-x-2">
            <kbd className="shortcut-key">J</kbd>
            <kbd className="shortcut-key">K</kbd>
            <span>to navigate</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Thread header */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-border-subtle">
        <h2 className="text-lg font-semibold text-text-primary leading-tight mb-2">
          {thread.subject || '(no subject)'}
        </h2>
        <div className="flex items-center gap-1 flex-wrap">
            <ActionButton
              label="Done"
              shortcut="E"
              onClick={onArchive}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              }
            />
            <ActionButton
              label="Pending"
              shortcut="P"
              onClick={() => onLabel('PENDING')}
              color="text-accent-pending"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <ActionButton
              label="Todo"
              shortcut="T"
              onClick={() => onLabel('TODO')}
              color="text-accent-todo"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              }
            />
            <ActionButton
              label={thread.labels.includes('STARRED') ? 'Unstar' : 'Star'}
              shortcut="S"
              onClick={onStar}
              color={thread.labels.includes('STARRED') ? 'text-yellow-400' : undefined}
              icon={
                <svg className="w-4 h-4" fill={thread.labels.includes('STARRED') ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              }
            />
            <ActionButton
              label="Reply"
              shortcut="R"
              onClick={onReply}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              }
            />
            {onDeleteDraft && thread.labels.includes('DRAFT') && (
              <ActionButton
                label="Delete Draft"
                onClick={() => onDeleteDraft(thread)}
                color="text-red-400"
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                }
              />
            )}
            <div className="w-px h-4 bg-border-subtle mx-1" />
            <ActionButton
              label="Details"
              shortcut="I"
              onClick={() => setShowDetails((p) => !p)}
              color={showDetails ? 'text-accent-primary' : undefined}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
              }
            />
        </div>
        <div className="text-xs text-text-muted mt-1.5">
          {thread.messages.length} message{thread.messages.length !== 1 ? 's' : ''} · {thread.participants.length} participant{thread.participants.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Details panel */}
      {showDetails && (
        <div className="flex-shrink-0 px-6 py-3 border-b border-border-subtle bg-bg-primary/60 text-xs font-mono space-y-2 max-h-[300px] overflow-y-auto scrollbar-hide">
          <div>
            <span className="text-text-muted">Thread ID: </span>
            <span className="text-text-secondary select-all">{thread.id}</span>
          </div>
          <div>
            <span className="text-text-muted">Labels: </span>
            <span className="text-text-primary">
              {thread.labels.length > 0
                ? thread.labels.map((l, i) => {
                    const name = labelName(l);
                    return (
                      <span key={l}>
                        {i > 0 && <span className="text-text-muted">, </span>}
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                          l === 'INBOX' ? 'bg-blue-500/20 text-blue-300' :
                          l === 'STARRED' ? 'bg-yellow-500/20 text-yellow-300' :
                          l === 'UNREAD' ? 'bg-green-500/20 text-green-300' :
                          l.startsWith('CATEGORY_') ? 'bg-purple-500/20 text-purple-300' :
                          'bg-bg-tertiary text-text-secondary'
                        }`}>{name}{name !== l ? <span className="text-text-muted ml-1 opacity-60">({l})</span> : null}</span>
                      </span>
                    );
                  })
                : <span className="text-text-muted italic">none</span>
              }
            </span>
          </div>
          <div>
            <span className="text-text-muted">Snippet: </span>
            <span className="text-text-secondary">{decodeHtmlEntities(thread.snippet)}</span>
          </div>
          {thread.messages.map((msg, idx) => (
            <details key={msg.id} className="border border-border-subtle rounded p-2" open={idx === thread.messages.length - 1}>
              <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
                Message {idx + 1}: <span className="text-text-muted">{msg.from.email}</span> → <span className="text-text-muted">{msg.to.map(t => t.email).join(', ')}</span>
                <span className="ml-2 text-text-muted">{msg.date}</span>
              </summary>
              <div className="mt-2 space-y-1 pl-2 border-l border-border-subtle">
                <div>
                  <span className="text-text-muted">Message ID: </span>
                  <span className="text-text-secondary select-all">{msg.id}</span>
                </div>
                <div>
                  <span className="text-text-muted">Labels: </span>
                  {msg.labels.length > 0
                    ? msg.labels.map((l) => {
                        const name = labelName(l);
                        return (
                          <span key={l} className={`inline-block mr-1 px-1.5 py-0.5 rounded text-[10px] ${
                            l === 'INBOX' ? 'bg-blue-500/20 text-blue-300' :
                            l === 'STARRED' ? 'bg-yellow-500/20 text-yellow-300' :
                            l === 'UNREAD' ? 'bg-green-500/20 text-green-300' :
                            l.startsWith('CATEGORY_') ? 'bg-purple-500/20 text-purple-300' :
                            'bg-bg-tertiary text-text-secondary'
                          }`}>{name}{name !== l ? <span className="text-text-muted ml-1 opacity-60">({l})</span> : null}</span>
                        );
                      })
                    : <span className="text-text-muted italic">none</span>
                  }
                </div>
                {msg.cc.length > 0 && (
                  <div>
                    <span className="text-text-muted">CC: </span>
                    <span className="text-text-secondary">{msg.cc.map(c => c.email).join(', ')}</span>
                  </div>
                )}
                {msg.attachments.length > 0 && (
                  <div>
                    <span className="text-text-muted">Attachments: </span>
                    <span className="text-text-secondary">{msg.attachments.map(a => `${a.filename} (${formatBytes(a.size)})`).join(', ')}</span>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}

      {/* Messages — newest first, older collapsed */}
      <ThreadMessages thread={thread} onArchive={onArchive} />
    </div>
  );
}

function ThreadMessages({ thread, onArchive }: { thread: EmailThread; onArchive: () => void }) {
  // Newest message first
  const reversed = [...thread.messages].reverse();
  const newestId = reversed[0]?.id;

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set([newestId]));
  const [showAll, setShowAll] = useState(false);

  // Reset expanded state when thread changes
  useEffect(() => {
    const newest = thread.messages[thread.messages.length - 1]?.id;
    setExpandedIds(new Set([newest]));
    setShowAll(false);
  }, [thread.id]);

  const toggleMessage = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (showAll) {
      // Collapse all except newest
      setExpandedIds(new Set([newestId]));
      setShowAll(false);
    } else {
      // Expand all
      setExpandedIds(new Set(reversed.map((m) => m.id)));
      setShowAll(true);
    }
  }, [showAll, newestId, reversed]);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-4 space-y-2">
      {/* Show all toggle (only if more than 1 message) */}
      {reversed.length > 1 && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-text-muted">
            {reversed.length} messages — newest first
          </span>
          <button
            onClick={toggleAll}
            className="text-[10px] text-accent-primary hover:text-accent-primary/80 transition-colors"
          >
            {showAll ? 'Collapse older' : 'Expand all'}
          </button>
        </div>
      )}

      {reversed.map((message) => {
        const isExpanded = expandedIds.has(message.id);

        if (isExpanded) {
          return <MessageBubble key={message.id} message={message} isNewest={message.id === newestId} onArchive={onArchive} />;
        }

        // Collapsed summary bar
        return (
          <button
            key={message.id}
            onClick={() => toggleMessage(message.id)}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg bg-bg-secondary/60 border border-border-subtle hover:bg-bg-hover transition-colors text-left group"
          >
            {/* Avatar */}
            <div className="w-6 h-6 rounded-full bg-bg-tertiary flex items-center justify-center text-[10px] font-semibold text-text-muted flex-shrink-0">
              {(message.from.name || message.from.email)[0]?.toUpperCase()}
            </div>
            {/* Sender */}
            <span className="text-xs font-medium text-text-secondary truncate min-w-[100px] max-w-[160px]">
              {message.from.name || message.from.email}
            </span>
            {/* Preview */}
            <span className="text-xs text-text-muted truncate flex-1">
              {decodeHtmlEntities(message.snippet || message.subject)}
            </span>
            {/* Date */}
            <span className="text-[10px] text-text-muted flex-shrink-0">
              {formatFullDate(message.date)}
            </span>
            {/* Expand indicator */}
            <svg className="w-3 h-3 text-text-muted group-hover:text-text-secondary flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

function RsvpBar({ message, onArchive }: { message: Email; onArchive?: () => void }) {
  const [rsvpStatus, setRsvpStatus] = useState<'none' | 'accepted' | 'tentative' | 'declined' | 'loading'>('none');
  const [eventId, setEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invite = detectCalendarInvite(message);

  useEffect(() => {
    if (!invite.isInvite) return;

    // If we extracted an event ID from the email, use it directly
    if (invite.iCalUID) {
      setEventId(invite.iCalUID);
      return;
    }

    // Otherwise try to find the event by searching the calendar for the subject
    // This is a fallback — the eid extraction usually works for Google invites
  }, [invite.isInvite, invite.iCalUID]);

  const handleRsvp = useCallback(async (response: 'accepted' | 'tentative' | 'declined') => {
    if (!eventId) {
      setError('Could not find calendar event ID');
      return;
    }
    setRsvpStatus('loading');
    setError(null);
    try {
      await window.kenaz.calendarRsvp(eventId, response);
      setRsvpStatus(response);
      // Auto-archive the thread after RSVP
      if (onArchive) {
        onArchive();
      }
    } catch (e: any) {
      setError(e.message || 'RSVP failed');
      setRsvpStatus('none');
    }
  }, [eventId]);

  if (!invite.isInvite) return null;

  const statusLabels: Record<string, string> = {
    accepted: 'Accepted',
    tentative: 'Maybe',
    declined: 'Declined',
    loading: 'Sending...',
  };

  const statusColors: Record<string, string> = {
    accepted: 'text-green-400',
    tentative: 'text-yellow-400',
    declined: 'text-red-400',
  };

  return (
    <div className="px-4 py-2.5 border-b border-border-subtle bg-bg-primary/50 flex items-center gap-3">
      <div className="flex items-center gap-1.5 text-xs text-text-muted">
        <svg className="w-4 h-4 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
        <span className="font-medium text-text-secondary">Calendar Invite</span>
      </div>

      {rsvpStatus === 'none' && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleRsvp('accepted')}
            disabled={!eventId}
            className="px-2.5 py-1 rounded text-[11px] font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ✓ Yes
          </button>
          <button
            onClick={() => handleRsvp('tentative')}
            disabled={!eventId}
            className="px-2.5 py-1 rounded text-[11px] font-medium bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ? Maybe
          </button>
          <button
            onClick={() => handleRsvp('declined')}
            disabled={!eventId}
            className="px-2.5 py-1 rounded text-[11px] font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ✕ No
          </button>
        </div>
      )}

      {rsvpStatus === 'loading' && (
        <span className="text-[11px] text-text-muted animate-pulse">Sending RSVP...</span>
      )}

      {(rsvpStatus === 'accepted' || rsvpStatus === 'tentative' || rsvpStatus === 'declined') && (
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium ${statusColors[rsvpStatus]}`}>
            {statusLabels[rsvpStatus]}
          </span>
          <button
            onClick={() => setRsvpStatus('none')}
            className="text-[10px] text-text-muted hover:text-text-secondary underline"
          >
            change
          </button>
        </div>
      )}

      {error && <span className="text-[11px] text-red-400">{error}</span>}

      {!eventId && invite.isInvite && (
        <span className="text-[10px] text-text-muted italic">Could not extract event ID — open in Google Calendar to respond</span>
      )}
    </div>
  );
}

function MessageBubble({ message, isNewest, onArchive }: { message: Email; isNewest: boolean; onArchive?: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Newest message shows everything by default; older messages collapse quotes
  const [showQuoted, setShowQuoted] = useState(isNewest);

  useEffect(() => {
    if (!iframeRef.current) return;

    const doc = iframeRef.current.contentDocument;
    if (!doc) return;

    // Strip quoted/forwarded content from the HTML body
    // We'll hide it and show a "show quoted text" button
    let bodyHtml = message.body;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          html {
            color-scheme: dark;
          }
          html, body {
            font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
            font-size: 14px;
            line-height: 1.5;
            color: #e2e8f0 !important;
            background: transparent !important;
            margin: 0;
            padding: 0;
            word-wrap: break-word;
            overflow-wrap: break-word;
            overflow: hidden;
          }
          /* Force dark-friendly colors on all elements */
          * {
            color: inherit !important;
            border-color: #334155 !important;
          }
          /* Kill white/light backgrounds everywhere */
          div, td, th, table, tr, tbody, thead,
          p, span, li, ul, ol, h1, h2, h3, h4, h5, h6,
          section, article, header, footer, main, aside, nav {
            background-color: transparent !important;
            background-image: none !important;
          }
          /* Keep images visible */
          img { max-width: 100%; height: auto; }
          /* Links stay blue */
          a, a * { color: #5b8def !important; }
          /* Buttons and styled elements get a subtle dark treatment */
          a[style*="background"], a[style*="padding"],
          td[style*="background-color"] a {
            background-color: #1e293b !important;
            color: #5b8def !important;
            border-radius: 4px;
          }
          table { max-width: 100% !important; width: auto !important; }
          div, td, th { max-width: 100% !important; }
          blockquote {
            border-left: 3px solid #334155 !important;
            margin: 8px 0;
            padding-left: 12px;
            color: #94a3b8 !important;
          }
          pre, code {
            background: #1e293b !important;
            border-radius: 4px;
            padding: 2px 4px;
            font-size: 13px;
          }
          pre { padding: 12px; overflow-x: auto; }
          /* Horizontal rules */
          hr { border-color: #334155 !important; }
          /* Quoted content toggle */
          .kenaz-quoted { display: ${showQuoted ? 'block' : 'none'}; }
        </style>
      </head>
      <body>${bodyHtml}</body>
      </html>
    `);
    doc.close();

    // Collapse quoted/forwarded content:
    // Gmail wraps quoted text in .gmail_quote, .gmail_extra, or blockquote
    // Also detect "On ... wrote:" patterns
    const quoteSelectors = [
      '.gmail_quote',
      '.gmail_extra',
      '.moz-cite-prefix',
      'blockquote[type="cite"]',
    ];
    const quotedElements: HTMLElement[] = [];
    for (const sel of quoteSelectors) {
      doc.querySelectorAll(sel).forEach((el) => quotedElements.push(el as HTMLElement));
    }

    // Also detect forwarded message separators
    const allElements = doc.body.querySelectorAll('*');
    for (const el of allElements) {
      const text = (el as HTMLElement).textContent || '';
      if (
        /^-{5,}\s*(Forwarded|Original)\s*message\s*-{5,}/i.test(text.trim()) ||
        /^On .+ wrote:$/m.test(text.trim())
      ) {
        // Walk up to a block-level parent to collapse the whole section
        let target = el as HTMLElement;
        if (target.parentElement && target.parentElement !== doc.body) {
          target = target.parentElement;
        }
        if (!quotedElements.includes(target)) {
          quotedElements.push(target);
        }
      }
    }

    // Wrap each quoted element with the kenaz-quoted class
    for (const el of quotedElements) {
      el.classList.add('kenaz-quoted');
    }

    // Prevent iframe from stealing focus after content write
    if (iframeRef.current) {
      iframeRef.current.blur();
    }

    // Open links in default browser instead of inside the iframe
    doc.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor && anchor.href && !anchor.href.startsWith('about:')) {
        e.preventDefault();
        window.open(anchor.href, '_blank');
      }
    });

    // When user clicks inside iframe, reclaim focus for parent (keeps shortcuts working)
    doc.addEventListener('mouseup', () => {
      // Small delay to allow text selection to complete, then reclaim focus
      setTimeout(() => {
        if (iframeRef.current) iframeRef.current.blur();
      }, 100);
    });

    // Forward keyboard events from iframe to parent so shortcuts still work
    // This is a safety net in case the iframe somehow has focus
    doc.addEventListener('keydown', (e: KeyboardEvent) => {
      const parentEvent = new KeyboardEvent('keydown', {
        key: e.key,
        code: e.code,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        bubbles: true,
      });
      window.dispatchEvent(parentEvent);
    });

    // Auto-resize iframe to content
    const resize = () => {
      if (iframeRef.current && doc.body) {
        const height = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
        iframeRef.current.style.height = height + 'px';
      }
    };

    // Resize after images load
    const images = doc.querySelectorAll('img');
    let loaded = 0;
    const onAssetReady = () => {
      loaded++;
      if (loaded >= images.length) resize();
    };
    images.forEach((img) => {
      img.addEventListener('load', onAssetReady);
      img.addEventListener('error', onAssetReady);
    });

    // Use ResizeObserver for dynamic content changes
    let resizeObserver: ResizeObserver | null = null;
    if (doc.body && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => resize());
      resizeObserver.observe(doc.body);
    }

    // Multiple resize passes to catch late-rendering content
    resize();
    const t1 = setTimeout(resize, 100);
    const t2 = setTimeout(resize, 500);
    const t3 = setTimeout(resize, 1500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [message.body, showQuoted]);

  // Detect if this message has quoted content (for showing the toggle)
  const hasQuotedContent = /gmail_quote|gmail_extra|blockquote.*?type="cite"|Forwarded message|On .+ wrote:/i.test(message.body);

  return (
    <div className={`rounded-lg bg-bg-secondary border border-border-subtle`}>
      {/* Message header */}
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center text-xs font-semibold text-text-secondary flex-shrink-0">
            {(message.from.name || message.from.email)[0]?.toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium text-text-primary">
              {message.from.name || message.from.email}
            </div>
            <div className="text-xs text-text-muted">
              to {message.to.map((t) => t.name || t.email).join(', ')}
              {message.cc.length > 0 && (
                <span> · cc: {message.cc.map((c) => c.name || c.email).join(', ')}</span>
              )}
            </div>
          </div>
        </div>
        <div className="text-xs text-text-muted">
          {formatFullDate(message.date)}
        </div>
      </div>

      {/* Calendar invite RSVP bar */}
      <RsvpBar message={message} onArchive={onArchive} />

      {/* Message body - sandboxed iframe */}
      <div className="px-4 py-3 selectable">
        <iframe
          ref={iframeRef}
          className="w-full border-0"
          sandbox="allow-same-origin"
          scrolling="no"
          style={{ minHeight: '60px', background: 'transparent', overflow: 'hidden' }}
          title={`Email from ${message.from.email}`}
        />
      </div>

      {/* Show quoted text toggle */}
      {hasQuotedContent && (
        <div className="px-4 pb-2">
          <button
            onClick={() => setShowQuoted((p) => !p)}
            className="text-[11px] text-text-muted hover:text-text-secondary transition-colors flex items-center gap-1"
          >
            <span className="inline-block w-6 h-[2px] bg-text-muted/40 rounded" />
            <span className="inline-block w-6 h-[2px] bg-text-muted/40 rounded" />
            <span className="inline-block w-6 h-[2px] bg-text-muted/40 rounded" />
            <span className="ml-1">{showQuoted ? 'Hide quoted text' : ''}</span>
          </button>
        </div>
      )}

      {/* Attachments */}
      {message.attachments.length > 0 && (
        <div className="px-4 py-2 border-t border-border-subtle">
          <div className="flex flex-wrap gap-2">
            {message.attachments.map((att) => (
              <button
                key={att.id}
                onClick={() => window.kenaz.downloadAttachment(message.id, att.id, att.filename)}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-bg-primary text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover cursor-pointer transition-colors"
                title={`Download ${att.filename}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>{att.filename}</span>
                <span className="text-text-muted">({formatBytes(att.size)})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  shortcut,
  onClick,
  icon,
  color,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs transition-colors hover:bg-bg-hover ${color || 'text-text-secondary hover:text-text-primary'}`}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
