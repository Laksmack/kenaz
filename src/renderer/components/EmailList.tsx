import React from 'react';
import type { EmailThread, ViewType } from '@shared/types';
import { formatRelativeDate } from '../lib/utils';

interface Props {
  threads: EmailThread[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (thread: EmailThread) => void;
  currentView: ViewType;
}

export function EmailList({ threads, selectedId, loading, onSelect, currentView }: Props) {
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
        />
      ))}
    </div>
  );
}

function EmailListItem({
  thread,
  selected,
  onClick,
}: {
  thread: EmailThread;
  selected: boolean;
  onClick: () => void;
}) {
  const isPending = thread.labels.includes('PENDING');
  const isFollowUp = thread.labels.includes('FOLLOWUP');

  return (
    <div
      onClick={onClick}
      className={`email-item ${selected ? 'active' : ''} ${thread.isUnread ? 'unread' : ''}`}
    >
      <div className="flex items-center gap-2 mb-1">
        {/* Status indicators */}
        {isPending && <span className="w-2 h-2 rounded-full bg-accent-pending flex-shrink-0" />}
        {isFollowUp && <span className="w-2 h-2 rounded-full bg-accent-followup flex-shrink-0" />}
        {thread.isUnread && !isPending && !isFollowUp && (
          <span className="w-2 h-2 rounded-full bg-accent-primary flex-shrink-0" />
        )}

        {/* Sender */}
        <span className={`text-sm truncate flex-1 ${thread.isUnread ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
          {thread.from.name || thread.from.email}
        </span>

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
        {isFollowUp && <span className="label-badge label-followup">Follow Up</span>}
        {thread.hasAttachments && (
          <span className="text-xs text-text-muted">
            <svg className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}
