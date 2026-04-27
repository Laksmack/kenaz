import React, { useRef, useEffect, useState, useCallback } from 'react';
import DOMPurify from 'dompurify';
import type { EmailThread, Email } from '@shared/types';
import { formatFullDate } from '../lib/utils';
import { detectCalendarInvite } from '../lib/detectInvite';
import { firstLinearIssueKey } from '../lib/linear';

// ── Print-ready HTML builder ─────────────────────────────────
// Builds clean, formatted HTML for printing/PDF — no buttons, no app chrome.

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildMessageBlock(msg: Email): string {
  const sanitized = DOMPurify.sanitize(msg.body, {
    ADD_TAGS: ['style'],
    ADD_ATTR: ['target', 'class', 'style'],
    ALLOW_DATA_ATTR: false,
    WHOLE_DOCUMENT: false,
  });
  const to = msg.to.map((t) => escHtml(t.name || t.email)).join(', ');
  const cc = msg.cc.length > 0
    ? `<div style="color:#666;font-size:12px;margin-top:2px;">CC: ${msg.cc.map((c) => escHtml(c.name || c.email)).join(', ')}</div>`
    : '';
  return `
    <div style="border:1px solid #e0e0e0;border-radius:8px;margin-bottom:16px;overflow:hidden;">
      <div style="padding:12px 16px;border-bottom:1px solid #e0e0e0;background:#f9f9f9;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:14px;">${escHtml(msg.from.name || msg.from.email)}</strong>
          <span style="color:#666;font-size:12px;">${escHtml(formatFullDate(msg.date))}</span>
        </div>
        <div style="color:#666;font-size:12px;margin-top:2px;">To: ${to}</div>
        ${cc}
      </div>
      <div style="padding:16px;font-size:14px;line-height:1.6;">${sanitized}</div>
    </div>`;
}

function wrapPrintHtml(subject: string, messagesHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #1c1917; }
    h1 { font-size: 18px; margin: 0 0 16px 0; }
    img { max-width: 100% !important; height: auto !important; }
    a { color: #2563eb; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${escHtml(subject || '(no subject)')}</h1>
  ${messagesHtml}
</body>
</html>`;
}

export function buildPrintHtml(thread: EmailThread): string {
  return wrapPrintHtml(thread.subject, thread.messages.map(buildMessageBlock).join(''));
}

export function buildPrintHtmlForMessage(thread: EmailThread, message: Email): string {
  return wrapPrintHtml(thread.subject, buildMessageBlock(message));
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim().substring(0, 100);
}

function decodeHtmlEntities(text: string): string {
  const el = document.createElement('textarea');
  el.innerHTML = text;
  return el.value;
}

// ── Nudge Detection ──────────────────────────────────────────
// Mirrors the logic in EmailList. Prefers sync-engine detection, falls back to heuristic.

interface NudgeInfo {
  type: 'follow_up' | 'reply';
  daysAgo: number;
  label: string;
}

function detectNudge(thread: EmailThread, userEmail?: string, currentView?: string): NudgeInfo | null {
  if (currentView !== 'inbox') return null;
  if (!userEmail) return null;

  const lastMsg = thread.messages[thread.messages.length - 1];
  if (!lastMsg) return null;

  const msgDate = new Date(lastMsg.date);
  if (isNaN(msgDate.getTime())) return null;

  const now = new Date();
  const daysAgo = Math.floor((now.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24));
  const dayStr = daysAgo === 1 ? 'day' : 'days';
  const isFromMe = lastMsg.from.email.toLowerCase() === userEmail.toLowerCase();

  // 1. Prefer sync-engine–detected nudge (History API: INBOX re-added without new messages)
  if (thread.nudgeType) {
    if (thread.nudgeType === 'follow_up') {
      return { type: 'follow_up', daysAgo, label: `Sent ${daysAgo} ${dayStr} ago. Follow up?` };
    }
    return { type: 'reply', daysAgo, label: `Received ${daysAgo} ${dayStr} ago. Reply?` };
  }

  // 2. Heuristic fallback
  if (isFromMe && daysAgo >= 2) {
    return { type: 'follow_up', daysAgo, label: `Sent ${daysAgo} ${dayStr} ago. Follow up?` };
  }

  if (!isFromMe && daysAgo >= 5) {
    return { type: 'reply', daysAgo, label: `Received ${daysAgo} ${dayStr} ago. Reply?` };
  }

  return null;
}

interface Props {
  thread: EmailThread | null;
  onReply: () => void;
  onArchive: () => void;
  /** Gmail-style report spam (moves to Spam, marks read, removes from Inbox). */
  onSpam?: () => void;
  onLabel: (label: string) => void;
  onStar: () => void;
  onDeleteDraft?: (thread: EmailThread) => void;
  onEditDraft?: (thread: EmailThread) => void;
  onSendDraft?: (thread: EmailThread) => void;
  threadUpdateAvailable?: boolean;
  onRefreshThread?: () => void;
  userEmail?: string;
  currentView?: string;
  linearEnabled?: boolean;
  printMenuOpen?: boolean;
  onTogglePrintMenu?: () => void;
}

export function EmailView({ thread, onReply, onArchive, onSpam, onLabel, onStar, onDeleteDraft, onEditDraft, onSendDraft, threadUpdateAvailable, onRefreshThread, userEmail, currentView, linearEnabled = false, printMenuOpen, onTogglePrintMenu }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const [labelMap, setLabelMap] = useState<Record<string, string>>({});
  const [linearIssue, setLinearIssue] = useState<any | null>(null);
  const [linearLoading, setLinearLoading] = useState(false);
  const [linearMessage, setLinearMessage] = useState<string | null>(null);
  const printMenuRef = useRef<HTMLDivElement>(null);
  const printBtnRef = useRef<HTMLButtonElement>(null);

  // Load label name map when details panel is opened
  useEffect(() => {
    if (!showDetails) return;
    window.kenaz.listLabels().then((labels) => {
      const map: Record<string, string> = {};
      for (const l of labels) {
        if (l.id !== l.name) map[l.id] = l.name;
      }
      setLabelMap(map);
    }).catch((e) => console.error('[EmailView] Failed to load label map:', e));
  }, [showDetails]);

  // Resolve a label ID to its human-readable name
  const labelName = (id: string) => labelMap[id] ? `${labelMap[id]}` : id;

  const linearIssueKey = thread && linearEnabled
    ? firstLinearIssueKey(`${thread.subject || ''}\n${thread.snippet || ''}`)
    : null;

  useEffect(() => {
    if (!thread || !linearEnabled || !linearIssueKey) {
      setLinearIssue(null);
      setLinearLoading(false);
      setLinearMessage(null);
      return;
    }
    let cancelled = false;
    setLinearLoading(true);
    window.kenaz.linearGetIssue(linearIssueKey).then((issue) => {
      if (!cancelled) {
        setLinearIssue(issue);
        setLinearMessage(issue ? null : `No Linear issue found for ${linearIssueKey}`);
      }
    }).catch((e) => {
      if (!cancelled) {
        setLinearIssue(null);
        setLinearMessage(e?.message || 'Failed to fetch Linear issue');
      }
    }).finally(() => {
      if (!cancelled) setLinearLoading(false);
    });
    return () => { cancelled = true; };
  }, [thread?.id, linearEnabled, linearIssueKey]);

  const createLinearFromEmail = useCallback(async () => {
    if (!thread) return;
    setLinearMessage(null);
    try {
      const teams = await window.kenaz.linearListTeams();
      if (!teams.length) {
        setLinearMessage('No Linear teams available for this API key');
        return;
      }
      const issueTitle = thread.subject || '(no subject)';
      const issueBody = [
        `From: ${thread.from.name || thread.from.email} <${thread.from.email}>`,
        '',
        thread.snippet || '',
        '',
        `Kenaz Thread: ${thread.id}`,
      ].join('\n');
      const result = await window.kenaz.linearCreateIssue({
        title: issueTitle,
        description: issueBody,
        teamId: teams[0].id,
      });
      if (result.success && result.issue?.url) {
        window.open(result.issue.url, '_blank');
        setLinearMessage(`Created ${result.issue.identifier}`);
      } else {
        setLinearMessage(result.error || 'Failed to create Linear issue');
      }
    } catch (e: any) {
      setLinearMessage(e?.message || 'Failed to create Linear issue');
    }
  }, [thread]);

  const addLinearComment = useCallback(async () => {
    if (!linearIssue?.id) return;
    const text = window.prompt('Comment for Linear issue');
    if (!text?.trim()) return;
    const result = await window.kenaz.linearAddComment(linearIssue.id, text.trim());
    setLinearMessage(result.success ? 'Comment added' : (result.error || 'Failed to add comment'));
  }, [linearIssue?.id]);

  // Close print menu on click outside or Escape
  useEffect(() => {
    if (!printMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (printMenuRef.current && !printMenuRef.current.contains(e.target as Node) &&
          printBtnRef.current && !printBtnRef.current.contains(e.target as Node)) {
        onTogglePrintMenu?.();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onTogglePrintMenu?.();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [printMenuOpen, onTogglePrintMenu]);

  // Close print menu when thread changes
  useEffect(() => {
    if (printMenuOpen) onTogglePrintMenu?.();
  }, [thread?.id]);

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
      <div
        className="flex-shrink-0 px-6 py-3 border-b border-border-subtle"
        onDoubleClick={thread.labels.includes('DRAFT') && onEditDraft ? () => onEditDraft(thread) : undefined}
        style={thread.labels.includes('DRAFT') && onEditDraft ? { cursor: 'pointer' } : undefined}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <h2 className="text-lg font-semibold text-text-primary leading-tight">
            {thread.subject || '(no subject)'}
          </h2>
          <button
            onClick={() => {
              const text = `[${thread.subject}] (thread:${thread.id})`;
              navigator.clipboard.writeText(text);
            }}
            className="flex-shrink-0 p-1 rounded hover:bg-bg-hover text-text-muted/40 hover:text-text-secondary transition-colors"
            title="Copy thread reference"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
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
            {onSpam && currentView !== 'drafts' && !thread.labels.includes('SPAM') && !thread.labels.includes('DRAFT') && (
              <ActionButton
                label="Spam"
                onClick={onSpam}
                color="text-orange-400"
                title="Report spam — moves to Gmail Spam, removes from Inbox (not Trash)"
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                }
              />
            )}
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
            <div className="relative">
              <button
                ref={printBtnRef}
                onClick={() => onTogglePrintMenu?.()}
                className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs transition-colors hover:bg-bg-hover ${printMenuOpen ? 'text-accent-primary bg-bg-hover' : 'text-text-secondary hover:text-text-primary'}`}
                title="Print / Save PDF (⌘P)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.25 7.034V3.375" />
                </svg>
                <span className="hidden lg:inline">PDF</span>
                <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {printMenuOpen && (
                <PrintMenu
                  ref={printMenuRef}
                  thread={thread}
                  onClose={() => onTogglePrintMenu?.()}
                />
              )}
            </div>
            {/* Draft-specific actions: Send + Edit */}
            {thread.labels.includes('DRAFT') && onSendDraft && (
              <ActionButton
                label="Send"
                onClick={() => onSendDraft(thread)}
                color="text-green-400"
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                }
              />
            )}
            {thread.labels.includes('DRAFT') && onEditDraft ? (
              <ActionButton
                label="Edit"
                shortcut="R"
                onClick={() => onEditDraft(thread)}
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                }
              />
            ) : (
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
            )}
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
        <div className="text-xs text-text-muted mt-1.5 flex items-center gap-3">
          <span>
            {thread.messages.length} message{thread.messages.length !== 1 ? 's' : ''} · {thread.participants.length} participant{thread.participants.length !== 1 ? 's' : ''}
          </span>
          {(() => {
            const nudge = detectNudge(thread, userEmail, currentView);
            if (!nudge) return null;
            return (
              <span
                className={`text-[11px] font-medium ${
                  nudge.type === 'follow_up' ? 'text-amber-500' : 'text-orange-400'
                }`}
                title={nudge.type === 'follow_up'
                  ? 'Gmail nudge: you sent the last message and haven\'t received a reply'
                  : 'Gmail nudge: you received this but haven\'t replied'}
              >
                {nudge.label}
              </span>
            );
          })()}
        </div>
        {linearEnabled && (
          <div className="text-xs mt-2 p-2 rounded-md border border-border-subtle bg-bg-primary/70">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-text-secondary">
                {linearIssueKey ? (
                  linearLoading ? (
                    <span className="text-text-muted">Loading Linear issue {linearIssueKey}…</span>
                  ) : linearIssue ? (
                    <span>
                      <span className="text-cyan-300 font-semibold">{linearIssue.identifier}</span>
                      {' · '}
                      <span className="text-text-primary">{linearIssue.title}</span>
                      {linearIssue.state?.name ? (
                        <span className="text-text-muted"> · {linearIssue.state.name}</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-text-muted">{linearMessage || `No issue found for ${linearIssueKey}`}</span>
                  )
                ) : (
                  <span className="text-text-muted">No Linear issue key detected</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {linearIssue?.url && (
                  <button
                    onClick={() => window.open(linearIssue.url, '_blank')}
                    className="px-2 py-1 rounded bg-bg-tertiary hover:bg-bg-hover text-[11px] text-text-secondary"
                  >
                    Open
                  </button>
                )}
                {linearIssue?.id && (
                  <button
                    onClick={addLinearComment}
                    className="px-2 py-1 rounded bg-bg-tertiary hover:bg-bg-hover text-[11px] text-text-secondary"
                  >
                    Comment
                  </button>
                )}
                <button
                  onClick={createLinearFromEmail}
                  className="px-2 py-1 rounded bg-bg-tertiary hover:bg-bg-hover text-[11px] text-text-secondary"
                >
                  Create Issue
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New messages in thread banner */}
      {threadUpdateAvailable && onRefreshThread && (
        <div className="flex-shrink-0 px-6 py-2.5 bg-accent-primary/15 border-b border-accent-primary/30">
          <button
            onClick={onRefreshThread}
            className="w-full text-sm font-medium text-accent-primary hover:text-accent-warm flex items-center justify-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.993 4.356v4.992" />
            </svg>
            New activity in this thread — click to refresh
          </button>
        </div>
      )}

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
  const newestId = thread.messages[thread.messages.length - 1]?.id;
  const messageIds = thread.messages.map((m) => m.id);
  const messageIdsKey = messageIds.join('|');

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    newestId ? new Set([newestId]) : new Set()
  );
  const [showAll, setShowAll] = useState(false);

  // Reset expanded state when thread changes
  useEffect(() => {
    const newest = thread.messages[thread.messages.length - 1]?.id;
    setExpandedIds(newest ? new Set([newest]) : new Set());
    setShowAll(false);
  }, [thread.id]);

  // Keep expansion state valid when same thread refreshes with new/loaded messages.
  // This prevents the "all collapsed" state after metadata-only -> full-thread updates.
  useEffect(() => {
    setExpandedIds((prev) => {
      if (messageIds.length === 0) return prev.size === 0 ? prev : new Set();

      if (showAll) {
        const alreadyAll = prev.size === messageIds.length && messageIds.every((id) => prev.has(id));
        return alreadyAll ? prev : new Set(messageIds);
      }

      const filtered = [...prev].filter((id) => messageIds.includes(id));
      if (filtered.length > 0) {
        const unchanged = filtered.length === prev.size;
        return unchanged ? prev : new Set(filtered);
      }

      if (!newestId) return prev;
      return prev.size === 1 && prev.has(newestId) ? prev : new Set([newestId]);
    });
  }, [messageIdsKey, newestId, showAll]);

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
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyCreated, setCopyCreated] = useState(false);

  const invite = detectCalendarInvite(message);
  const hasIcsAttachment = message.attachments.some(
    (a) => a.filename.endsWith('.ics') || a.mimeType === 'text/calendar' || a.mimeType === 'application/ics'
  );

  useEffect(() => {
    if (!invite.isInvite) return;

    const isForwarded = message.subject.toLowerCase().startsWith('fwd:');
    if (isForwarded) {
      setResolving(false);
      return;
    }

    const icsAttachment = message.attachments.find(
      (a) => a.filename.endsWith('.ics') || a.mimeType === 'text/calendar' || a.mimeType === 'application/ics'
    );

    let cancelled = false;
    setResolving(true);

    (async () => {
      try {
        if (invite.iCalUID) {
          const id = await window.kenaz.calendarFindEvent(invite.iCalUID);
          if (cancelled) return;
          if (id) { setEventId(id); return; }
        }

        if (!icsAttachment) return;
        const base64 = await window.kenaz.getAttachmentBase64(message.id, icsAttachment.id);
        if (cancelled) return;
        const icsRaw = atob(base64);
        const icsText = icsRaw.replace(/\r?\n[ \t]/g, '');
        const uidMatch = icsText.match(/^UID:(.+)$/m);
        if (!uidMatch) return;
        const uid = uidMatch[1].trim();

        const googleEventId = await window.kenaz.calendarFindEvent(uid);
        if (cancelled) return;
        if (googleEventId) { setEventId(googleEventId); return; }
      } catch (e) {
        console.error('[RsvpBar] Event resolution failed:', e);
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [invite.isInvite, invite.iCalUID, message.id, message.subject]);

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

  const handleCreateCopy = useCallback(async () => {
    const icsAttachment = message.attachments.find(
      (a) => a.filename.endsWith('.ics') || a.mimeType === 'text/calendar' || a.mimeType === 'application/ics'
    );
    if (!icsAttachment) return;
    setCopying(true);
    setError(null);
    setCopyCreated(false);
    try {
      const base64 = await window.kenaz.getAttachmentBase64(message.id, icsAttachment.id);
      const icsRaw = atob(base64);
      const icsText = icsRaw.replace(/\r?\n[ \t]/g, '');
      const importedId = await window.kenaz.calendarCreateCopyFromIcs(icsText);
      if (importedId) {
        // This is a personal copy, not an event you can RSVP to.
        setCopyCreated(true);
      } else {
        setError('Could not create calendar event');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to create copy');
    } finally {
      setCopying(false);
    }
  }, [message.id, message.attachments]);

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

      {rsvpStatus === 'none' && eventId && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleRsvp('accepted')}
            disabled={!eventId}
            className="px-2.5 py-1 rounded text-[11px] font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-40"
          >
            ✓ Yes
          </button>
          <button
            onClick={() => handleRsvp('tentative')}
            disabled={!eventId}
            className="px-2.5 py-1 rounded text-[11px] font-medium bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-colors disabled:opacity-40"
          >
            ? Maybe
          </button>
          <button
            onClick={() => handleRsvp('declined')}
            disabled={!eventId}
            className="px-2.5 py-1 rounded text-[11px] font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-40"
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

      {copyCreated && (
        <span className="text-[10px] text-green-400 italic">Copy created in your calendar</span>
      )}
      {!eventId && invite.isInvite && resolving && (
        <span className="text-[10px] text-text-muted italic animate-pulse">Looking up calendar event...</span>
      )}
      {!eventId && invite.isInvite && !resolving && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted italic">
            {message.subject.toLowerCase().startsWith('fwd:')
              ? 'Forwarded invite — not in your calendar'
              : 'Could not find event — open in Google Calendar to respond'}
          </span>
          {hasIcsAttachment && (
            <button
              onClick={handleCreateCopy}
              disabled={copying}
              className="px-2.5 py-1 rounded text-[11px] font-medium bg-accent-primary/15 text-accent-primary hover:bg-accent-primary/25 transition-colors disabled:opacity-60"
            >
              {copying ? 'Creating...' : 'Create copy in own calendar'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CopyableEmail({ name, email }: { name?: string; email: string }) {
  const display = name || email;
  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(email);
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = '0.5';
    setTimeout(() => { el.style.opacity = '1'; }, 200);
  };
  return (
    <span
      className="cursor-pointer hover:underline hover:text-text-primary transition-colors"
      title={`${email} — click to copy`}
      onClick={handleCopy}
      onContextMenu={handleCopy}
    >{display}</span>
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
    // Fix protocol-relative URLs (//fonts.gstatic.com → https://fonts.gstatic.com)
    // In Electron's file:// context these resolve to file:// instead of https://
    let bodyHtml = DOMPurify.sanitize(message.body, {
      ADD_TAGS: ['style'],
      ADD_ATTR: ['target', 'class', 'style'],
      ALLOW_DATA_ATTR: false,
      WHOLE_DOCUMENT: false,
    }).replace(/(?:src|href)=(["'])\/\//g, (match, quote) => {
      return match.replace(`${quote}//`, `${quote}https://`);
    }).replace(/url\((['"]?)\/\//g, (_match, quote) => {
      return `url(${quote}https://`;
    });

    // Always use a light reading pane inside the iframe (Mail / Gmail web style):
    // Slightly warm off-white (#f9f8f6) reads softer than pure #fff against dark chrome.
    const readingPaneBase = `
          html { color-scheme: light; }
          html, body {
            color: #292524;
            background: #f9f8f6 !important;
          }
          a { color: #2563eb; }
          blockquote { border-left: 3px solid #d6d3d1; color: #57534e; }
          pre, code { background: #f5f5f4; }
          hr { border-color: #e7e5e4; }
    `;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http: cid:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com https://fonts.googleapis.com;">
        <style>
          html, body {
            font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
            font-size: 14px;
            line-height: 1.5;
            margin: 0;
            padding: 0;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          body { overflow-x: hidden !important; }
          img { max-width: 100% !important; height: auto !important; width: auto !important; }
          table { max-width: 100% !important; }
          blockquote { margin: 8px 0; padding-left: 12px; }
          pre, code { border-radius: 4px; padding: 2px 4px; font-size: 13px; }
          pre { padding: 12px; overflow-x: auto; }
          .kenaz-quoted { display: ${showQuoted ? 'block' : 'none'}; }
          ${readingPaneBase}
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

    // Also detect forwarded message separators and "On … wrote:" patterns.
    // Only check small elements — large containers include descendant text in
    // textContent which would cause the entire message body to collapse.
    const allElements = doc.body.querySelectorAll('*');
    for (const el of allElements) {
      const htmlEl = el as HTMLElement;
      const text = htmlEl.textContent || '';
      if (text.length > 600) continue;
      if (
        /^-{5,}\s*(Forwarded|Original)\s*message\s*-{5,}/i.test(text.trim()) ||
        /^On .+ wrote:$/m.test(text.trim())
      ) {
        let target = htmlEl;
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

    // Open links in default browser instead of inside the iframe
    doc.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor && anchor.href && !anchor.href.startsWith('about:')) {
        e.preventDefault();
        window.open(anchor.href, '_blank');
      }
    });

    // NOTE: We no longer blur the iframe on mouseup — the keyboard bridge
    // (bridgeIframeKeys) handles forwarding shortcuts to the parent, and
    // blurring broke Cmd+C (copy) by moving focus away from the selection.

    // Always bridge iframe key presses back to the main window. This avoids
    // stale "__kenazBridged" states after doc.write cycles where listeners can
    // be dropped while flags remain.
    const bridgeKeydown = (e: KeyboardEvent) => {
      // Keep native clipboard/select shortcuts inside the iframe.
      if ((e.metaKey || e.ctrlKey) && ['c', 'a', 'v', 'x'].includes(e.key.toLowerCase())) {
        return;
      }
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: e.key,
        code: e.code,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        bubbles: true,
      }));
    };
    doc.addEventListener('keydown', bridgeKeydown);

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
      doc.removeEventListener('keydown', bridgeKeydown);
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
          <div className="selectable">
            <div className="text-sm font-medium text-text-primary">
              <CopyableEmail name={message.from.name} email={message.from.email} />
            </div>
            <div className="text-xs text-text-muted">
              to {message.to.map((t, i) => (
                <span key={t.email + i}>
                  {i > 0 && ', '}
                  <CopyableEmail name={t.name} email={t.email} />
                </span>
              ))}
              {message.cc.length > 0 && (
                <span> · cc: {message.cc.map((c, i) => (
                  <span key={c.email + i}>
                    {i > 0 && ', '}
                    <CopyableEmail name={c.name} email={c.email} />
                  </span>
                ))}</span>
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

      {/* Message body — rounded “paper” so the light pane doesn’t read as a harsh white slab */}
      <div className="px-4 py-3 selectable">
        <div className="rounded-xl overflow-hidden border border-stone-300/50 dark:border-stone-600/35 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_4px_14px_rgba(0,0,0,0.25)] bg-[#f4f3f1]">
          <iframe
            ref={iframeRef}
            className="w-full border-0 block"
            sandbox="allow-same-origin"
            scrolling="no"
            style={{ minHeight: '60px', background: '#f9f8f6', overflow: 'hidden' }}
            title={`Email from ${message.from.email}`}
          />
        </div>
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

// ── Print / Save PDF popover ─────────────────────────────────
const PrintMenu = React.forwardRef<HTMLDivElement, { thread: EmailThread; onClose: () => void }>(
  ({ thread, onClose }, ref) => {
    const newestMessage = thread.messages[thread.messages.length - 1];
    const filename = sanitizeFilename(thread.subject || 'email') + '.pdf';
    const hasMultipleMessages = thread.messages.length > 1;

    const handleAction = (mode: 'pdf' | 'print', scope: 'message' | 'thread') => {
      const html = scope === 'message'
        ? buildPrintHtmlForMessage(thread, newestMessage)
        : buildPrintHtml(thread);
      onClose();
      if (mode === 'pdf') {
        window.kenaz.saveEmailPdf(html, filename);
      } else {
        window.kenaz.printEmail(html);
      }
    };

    return (
      <div
        ref={ref}
        className="absolute right-0 top-full mt-1 z-50 py-1.5 min-w-[200px] bg-bg-secondary border border-border-subtle rounded-lg shadow-2xl"
      >
        <div className="px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider font-medium">
          Save as PDF
        </div>
        <button
          onClick={() => handleAction('pdf', 'message')}
          className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          This message
          <span className="ml-auto text-[10px] text-text-muted">⌘S</span>
        </button>
        {hasMultipleMessages && (
          <button
            onClick={() => handleAction('pdf', 'thread')}
            className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
            Entire thread ({thread.messages.length} messages)
          </button>
        )}
        <div className="border-t border-border-subtle my-1" />
        <div className="px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider font-medium">
          Print
        </div>
        <button
          onClick={() => handleAction('print', 'message')}
          className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.25 7.034V3.375" />
          </svg>
          This message
        </button>
        {hasMultipleMessages && (
          <button
            onClick={() => handleAction('print', 'thread')}
            className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.25 7.034V3.375" />
          </svg>
            Entire thread ({thread.messages.length} messages)
          </button>
        )}
      </div>
    );
  }
);

function ActionButton({
  label,
  shortcut,
  onClick,
  icon,
  color,
  title: titleOverride,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  icon: React.ReactNode;
  color?: string;
  /** Native tooltip (defaults to label ± shortcut). */
  title?: string;
}) {
  const title = titleOverride ?? (shortcut ? `${label} (${shortcut})` : label);
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs transition-colors hover:bg-bg-hover ${color || 'text-text-secondary hover:text-text-primary'}`}
      title={title}
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
