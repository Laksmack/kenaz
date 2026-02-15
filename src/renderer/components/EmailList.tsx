import React, { useState, useRef, useEffect } from 'react';
import type { EmailThread, ViewType, View } from '@shared/types';
import { formatRelativeDate } from '../lib/utils';

// ── Nudge Detection ──────────────────────────────────────────
// Gmail nudges re-add the INBOX label to a thread without adding new messages,
// pushing it back to the top of the inbox. The sync engine detects this via the
// History API and sets thread.nudgeType. This heuristic serves as a fallback
// for threads loaded before the sync engine caught the event.

interface NudgeInfo {
  type: 'follow_up' | 'reply';
  daysAgo: number;
  label: string;
}

function detectNudge(thread: EmailThread, userEmail?: string, currentView?: string): NudgeInfo | null {
  // Only detect nudges in inbox view — that's where Gmail surfaces them
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

  // 1. Prefer the sync-engine–detected nudge (set via History API)
  if (thread.nudgeType) {
    if (thread.nudgeType === 'follow_up') {
      return { type: 'follow_up', daysAgo, label: `Sent ${daysAgo} ${dayStr} ago. Follow up?` };
    }
    return { type: 'reply', daysAgo, label: `Received ${daysAgo} ${dayStr} ago. Reply?` };
  }

  // 2. Heuristic fallback: detect nudge-like patterns for threads
  //    not yet flagged by the sync engine.

  // "Sent X days ago. Follow up?" — you sent the last message, no reply yet
  if (isFromMe && daysAgo >= 2) {
    return {
      type: 'follow_up',
      daysAgo,
      label: `Sent ${daysAgo} ${dayStr} ago. Follow up?`,
    };
  }

  // "Received X days ago. Reply?" — someone wrote to you, you haven't replied
  if (!isFromMe && daysAgo >= 5) {
    return {
      type: 'reply',
      daysAgo,
      label: `Received ${daysAgo} ${dayStr} ago. Reply?`,
    };
  }

  return null;
}

// Format snooze date as a friendly relative string
function formatSnoozeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'waking up...';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays <= 7) return `${diffDays} days`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Clean snippet text: strip HTML tags, decode entities, collapse whitespace
function cleanSnippet(text: string): string {
  // Strip HTML tags
  const stripped = text.replace(/<[^>]*>/g, ' ');
  // Strip data URIs (base64 images etc.) that leak into snippets
  const noData = stripped.replace(/data:[^\s"')]+/g, '');
  // Decode HTML entities
  const el = document.createElement('textarea');
  el.innerHTML = noData;
  // Collapse whitespace
  return el.value.replace(/\s+/g, ' ').trim();
}

interface ContextMenuAction {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
  separator?: boolean;
}

interface Props {
  threads: EmailThread[];
  selectedId: string | null;
  selectedIds: Set<string>;
  loading: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onSelect: (thread: EmailThread) => void;
  onMultiSelect: (ids: Set<string>) => void;
  onLoadMore?: () => void;
  currentView: ViewType;
  userEmail?: string;
  views?: View[];
  onArchive?: (threadId: string) => void;
  onLabel?: (threadId: string, label: string) => void;
  onStar?: (threadId: string) => void;
  onCreateRule?: (senderEmail: string, senderName: string) => void;
  onDoubleClick?: (thread: EmailThread) => void;
  userDisplayName?: string;
}

export function EmailList({ threads, selectedId, selectedIds, loading, loadingMore, hasMore, onSelect, onMultiSelect, onLoadMore, currentView, userEmail, userDisplayName, views = [], onArchive, onLabel, onStar, onCreateRule, onDoubleClick }: Props) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; thread: EmailThread } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const lastClickedIdRef = useRef<string | null>(null);
  const [snoozeMap, setSnoozeMap] = useState<Map<string, string>>(new Map());

  // Load snooze data when in snoozed view
  useEffect(() => {
    if (currentView !== 'snoozed') {
      if (snoozeMap.size > 0) setSnoozeMap(new Map());
      return;
    }
    window.kenaz.listSnoozed().then((items) => {
      const map = new Map<string, string>();
      for (const item of items) {
        map.set(item.threadId, item.snoozeUntil);
      }
      setSnoozeMap(map);
    }).catch(() => {});
  }, [currentView, threads]);

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);

  // Reposition menu if it overflows the viewport
  useEffect(() => {
    if (!contextMenu || !menuRef.current) return;
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let { x, y } = contextMenu;
    // Flip up if it would overflow the bottom
    if (rect.bottom > vh) {
      y = Math.max(4, y - rect.height);
    }
    // Flip left if it would overflow the right
    if (rect.right > vw) {
      x = Math.max(4, x - rect.width);
    }
    if (x !== contextMenu.x || y !== contextMenu.y) {
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
    }
  });

  const handleItemClick = (e: React.MouseEvent, thread: EmailThread) => {
    if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+click: toggle individual selection
      const next = new Set(selectedIds);
      if (next.has(thread.id)) {
        next.delete(thread.id);
      } else {
        next.add(thread.id);
      }
      onMultiSelect(next);
      lastClickedIdRef.current = thread.id;
    } else if (e.shiftKey && lastClickedIdRef.current) {
      // Shift+click: range selection from last clicked to this one
      const startIdx = threads.findIndex((t) => t.id === lastClickedIdRef.current);
      const endIdx = threads.findIndex((t) => t.id === thread.id);
      if (startIdx !== -1 && endIdx !== -1) {
        const from = Math.min(startIdx, endIdx);
        const to = Math.max(startIdx, endIdx);
        const next = new Set(selectedIds);
        for (let i = from; i <= to; i++) {
          next.add(threads[i].id);
        }
        onMultiSelect(next);
      }
    } else {
      // Normal click: clear multi-select, select single thread
      if (selectedIds.size > 0) {
        onMultiSelect(new Set());
      }
      setContextMenu(null);
      onSelect(thread);
      lastClickedIdRef.current = thread.id;
    }
  };

  const handleContextMenu = (e: React.MouseEvent, thread: EmailThread) => {
    e.preventDefault();
    // If right-clicking a thread not in the multi-selection, select only that one
    if (selectedIds.size > 0 && !selectedIds.has(thread.id)) {
      onMultiSelect(new Set([thread.id]));
    } else if (selectedIds.size === 0) {
      // No multi-select: context menu for this single thread
    }
    setContextMenu({ x: e.clientX, y: e.clientY, thread });
  };

  // Get the thread IDs that the context menu should apply to
  const getTargetIds = (thread: EmailThread): string[] => {
    if (selectedIds.size > 1 && selectedIds.has(thread.id)) {
      return Array.from(selectedIds);
    }
    return [thread.id];
  };

  // Build context menu actions for a thread (or multiple selected threads)
  const getMenuActions = (thread: EmailThread): ContextMenuAction[] => {
    const actions: ContextMenuAction[] = [];
    const targetIds = getTargetIds(thread);
    const count = targetIds.length;
    const plural = count > 1 ? ` (${count})` : '';

    // Move to view actions (label-based views, skip current view, sent, all, drafts)
    const moveableViews = views.filter((v) =>
      v.id !== currentView && v.id !== 'all' && v.id !== 'sent' && v.id !== 'drafts' && v.id !== 'inbox'
    );
    if (moveableViews.length > 0) {
      for (const v of moveableViews) {
        actions.push({
          label: `Move to ${v.name}${plural}`,
          icon: v.icon || '📁',
          onClick: () => {
            const match = v.query.match(/label:(\S+)/i);
            if (match && onLabel) {
              for (const id of targetIds) onLabel(id, match[1]);
            }
            onMultiSelect(new Set());
          },
        });
      }
      actions.push({ label: '', onClick: () => {}, separator: true });
    }

    // Archive
    actions.push({
      label: `Done (Archive)${plural}`,
      icon: '✓',
      onClick: () => {
        for (const id of targetIds) onArchive?.(id);
        onMultiSelect(new Set());
      },
    });

    // Star/Unstar (only for single thread)
    if (count === 1) {
      const isStarred = thread.labels.includes('STARRED');
      actions.push({
        label: isStarred ? 'Unstar' : 'Star',
        icon: isStarred ? '☆' : '⭐',
        onClick: () => onStar?.(thread.id),
      });
    }

    actions.push({ label: '', onClick: () => {}, separator: true });

    // Create rule (only for single thread)
    if (count === 1) {
      actions.push({
        label: 'Create Rule for Sender...',
        icon: '⚡',
        onClick: () => {
          const sender = thread.from.email;
          const name = thread.from.name || sender;
          onCreateRule?.(sender, name);
        },
      });
    }

    return actions;
  };

  // Infinite scroll: trigger loadMore when sentinel enters viewport
  // (must be declared before early returns to avoid React hook ordering issues)
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || !onLoadMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) {
          onLoadMore();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  if (loading && threads.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-text-muted text-sm">Loading emails...</div>
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-text-muted text-sm mb-1">No emails</div>
          <div className="text-text-muted text-xs">
            {currentView === 'inbox' ? 'Inbox zero!' : `No ${currentView} emails`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide relative">
      {threads.map((thread) => (
        <EmailListItem
          key={thread.id}
          thread={thread}
          selected={thread.id === selectedId}
          multiSelected={selectedIds.has(thread.id)}
          onClick={(e) => handleItemClick(e, thread)}
          onDoubleClick={onDoubleClick ? () => onDoubleClick(thread) : undefined}
          onContextMenu={(e) => handleContextMenu(e, thread)}
          userEmail={userEmail}
          userDisplayName={userDisplayName}
          currentView={currentView}
          snoozeUntil={snoozeMap.get(thread.id)}
        />
      ))}

      {/* Load More / Infinite Scroll */}
      {hasMore && (
        <div ref={sentinelRef} className="py-3 flex items-center justify-center">
          {loadingMore ? (
            <span className="text-xs text-text-muted">Loading more…</span>
          ) : (
            <button
              onClick={onLoadMore}
              className="text-xs text-accent-primary hover:text-accent-primary/80 transition-colors"
            >
              Load more
            </button>
          )}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 py-1 min-w-[200px] bg-bg-secondary border border-border-subtle rounded-lg shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {getMenuActions(contextMenu.thread).map((action, i) =>
            action.separator ? (
              <div key={i} className="border-t border-border-subtle my-1" />
            ) : (
              <button
                key={i}
                onClick={() => { action.onClick(); setContextMenu(null); }}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                  action.danger
                    ? 'text-accent-danger hover:bg-accent-danger/10'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                }`}
              >
                {action.icon && <span className="w-4 text-center">{action.icon}</span>}
                {action.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Determine the user's role in this thread:
 * - 'to': user is in the TO field of the most recent message
 * - 'cc': user is in the CC field
 * - 'none': user is neither (BCC, forwarded, etc.)
 */
function getUserRole(thread: EmailThread, userEmail?: string): 'to' | 'cc' | 'none' {
  if (!userEmail) return 'none';
  const email = userEmail.toLowerCase();
  // Check the most recent message
  const lastMsg = thread.messages[thread.messages.length - 1];
  if (!lastMsg) return 'none';

  if (lastMsg.to.some((a) => a.email.toLowerCase() === email)) return 'to';
  if (lastMsg.cc.some((a) => a.email.toLowerCase() === email)) return 'cc';
  return 'none';
}

/**
 * Recipient dot indicator:
 * - Full circle: user is in TO
 * - Half circle (left half filled): user is on CC
 * - Empty circle: user is neither
 * - Colored when unread, grey when read
 */
function RecipientDot({ role, isUnread }: { role: 'to' | 'cc' | 'none'; isUnread: boolean }) {
  const color = isUnread ? 'var(--color-primary)' : '#444';
  const size = 8;

  if (role === 'to') {
    // Full filled circle
    return (
      <span
        className="inline-block flex-shrink-0 rounded-full"
        style={{ width: size, height: size, backgroundColor: color }}
        title="You are in TO"
      />
    );
  }

  if (role === 'cc') {
    // Half filled circle (left half filled, right half empty)
    return (
      <span className="flex-shrink-0" title="You are in CC">
        <svg width={size} height={size} viewBox="0 0 8 8">
          <circle cx="4" cy="4" r="3.5" fill="none" stroke={color} strokeWidth="1" />
          <path d="M4 0.5 A3.5 3.5 0 0 0 4 7.5 Z" fill={color} />
        </svg>
      </span>
    );
  }

  // Empty circle
  return (
    <span className="flex-shrink-0" title="Not in TO or CC">
      <svg width={size} height={size} viewBox="0 0 8 8">
        <circle cx="4" cy="4" r="3" fill="none" stroke={color} strokeWidth="1" />
      </svg>
    </span>
  );
}

function EmailListItem({
  thread,
  selected,
  multiSelected,
  onClick,
  onDoubleClick,
  onContextMenu,
  userEmail,
  userDisplayName,
  currentView,
}: {
  thread: EmailThread;
  selected: boolean;
  multiSelected?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  userEmail?: string;
  userDisplayName?: string;
  currentView?: string;
  snoozeUntil?: string;
}) {
  const isPending = thread.labels.includes('PENDING');
  const isTodo = thread.labels.includes('TODO');
  const isSnoozed = thread.labels.includes('SNOOZED');
  const isStarred = thread.labels.includes('STARRED');
  const hasAttachments = thread.messages.some((m) => m.hasAttachments);
  const role = getUserRole(thread, userEmail);
  const nudge = detectNudge(thread, userEmail, currentView);

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={`email-item ${selected ? 'active' : ''} ${multiSelected ? 'multi-selected' : ''} ${thread.isUnread ? 'unread' : ''}`}
    >
      <div className="flex items-center gap-2 mb-1">
        {/* Sender */}
        <span className={`text-sm truncate flex-1 ${thread.isUnread ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
          {(() => {
            const name = thread.from.name || thread.from.email;
            // If sender is current user and name looks like an email, use display name
            if (userDisplayName && userEmail && thread.from.email.toLowerCase() === userEmail.toLowerCase() && name.includes('@')) {
              return userDisplayName;
            }
            return name;
          })()}
        </span>

        {/* Recipient role dot (right of sender) */}
        <RecipientDot role={role} isUnread={thread.isUnread} />

        {/* Attachment indicator */}
        {hasAttachments && (
          <svg className="w-3 h-3 flex-shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        )}

        {/* Date */}
        <span className="text-xs text-text-muted flex-shrink-0">
          {formatRelativeDate(thread.lastDate)}
        </span>
      </div>

      {/* Subject */}
      <div className={`text-sm truncate mb-0.5 ${thread.isUnread ? 'text-text-primary' : 'text-text-secondary'}`}>
        {thread.subject || '(no subject)'}
        {thread.messages.length > 1 && (
          <span className="text-text-muted text-xs ml-1">({thread.messages.length})</span>
        )}
      </div>

      {/* Snippet */}
      <div className="text-xs text-text-muted truncate">
        {cleanSnippet(thread.snippet)}
      </div>

      {/* Labels + Nudge */}
      <div className="flex items-center gap-1.5 mt-1.5">
        {isPending && <span className="label-badge label-pending">Pending</span>}
        {isTodo && <span className="label-badge label-todo">Todo</span>}
        {isSnoozed && snoozeUntil && (
          <span className="label-badge bg-blue-500/15 text-blue-400 border-blue-500/20" title={`Snoozed until ${new Date(snoozeUntil).toLocaleDateString()}`}>
            ⏰ {formatSnoozeDate(snoozeUntil)}
          </span>
        )}
        {isStarred && <span className="text-yellow-400 text-xs">★</span>}
        {nudge && (
          <span
            className={`text-[10px] font-medium ${
              nudge.type === 'follow_up' ? 'text-amber-500' : 'text-orange-400'
            }`}
            title={nudge.type === 'follow_up'
              ? 'Gmail nudge: you sent the last message and haven\'t received a reply'
              : 'Gmail nudge: you received this but haven\'t replied'}
          >
            {nudge.label}
          </span>
        )}
      </div>
    </div>
  );
}
