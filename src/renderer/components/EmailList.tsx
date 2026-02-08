import React from 'react';
import type { EmailThread, ViewType } from '@shared/types';
import { formatRelativeDate } from '../lib/utils';

interface Props {
  threads: EmailThread[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (thread: EmailThread) => void;
  currentView: ViewType;
  userEmail?: string;
}

export function EmailList({ threads, selectedId, loading, onSelect, currentView, userEmail }: Props) {
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
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      {threads.map((thread) => (
        <EmailListItem
          key={thread.id}
          thread={thread}
          selected={thread.id === selectedId}
          onClick={() => onSelect(thread)}
          userEmail={userEmail}
        />
      ))}
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
  onClick,
  userEmail,
}: {
  thread: EmailThread;
  selected: boolean;
  onClick: () => void;
  userEmail?: string;
}) {
  const isPending = thread.labels.includes('PENDING');
  const isFollowUp = thread.labels.includes('FOLLOWUP');
  const isStarred = thread.labels.includes('STARRED');
  const hasAttachments = thread.messages.some((m) => m.hasAttachments);
  const role = getUserRole(thread, userEmail);

  return (
    <div
      onClick={onClick}
      className={`email-item ${selected ? 'active' : ''} ${thread.isUnread ? 'unread' : ''}`}
    >
      <div className="flex items-center gap-2 mb-1">
        {/* Sender */}
        <span className={`text-sm truncate flex-1 ${thread.isUnread ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
          {thread.from.name || thread.from.email}
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
        {thread.snippet}
      </div>

      {/* Labels */}
      <div className="flex items-center gap-1 mt-1.5">
        {isPending && <span className="label-badge label-pending">Pending</span>}
        {isFollowUp && <span className="label-badge label-followup">Todo</span>}
        {isStarred && <span className="text-yellow-400 text-xs">★</span>}
      </div>
    </div>
  );
}
