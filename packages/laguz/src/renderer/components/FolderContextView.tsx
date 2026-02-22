import React, { useState, useEffect, useCallback } from 'react';
import { formatName } from '../lib/formatName';
import { formatDate } from '../lib/utils';
import type { FolderContextData, NoteSummary } from '../types';

interface FolderContextViewProps {
  folderName: string;
  onOpenFile: (path: string) => void;
  onBack?: () => void;
}

export function FolderContextView({ folderName, onOpenFile, onBack }: FolderContextViewProps) {
  const [data, setData] = useState<FolderContextData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    window.laguz.getFolderContext(folderName)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [folderName]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-text-muted text-sm">Loading context for {formatName(folderName)}...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <div className="text-sm">No data found for {formatName(folderName)}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto scrollbar-hide">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="text-text-muted hover:text-text-primary transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div>
            <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <span className="opacity-60">{'\uD83D\uDCC1'}</span>
              {formatName(folderName)}
            </h1>
            <p className="text-xs text-text-muted mt-0.5">{data.folder}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-text-muted">
          <span>{data.notes.length} notes</span>
          <span>{data.emails.length} emails</span>
          <span>{data.tasks.length} tasks</span>
          <span>{data.events.length} events</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* Notes */}
        <ContextSection title="Notes" icon={'\uD83D\uDCDD'} count={data.notes.length} defaultOpen>
          {data.notes.length === 0
            ? <EmptyState text="No notes in this folder" />
            : data.notes.map((note) => (
              <NoteRow key={note.id} note={note} onClick={() => onOpenFile(note.path)} />
            ))
          }
        </ContextSection>

        {/* Emails */}
        <ContextSection title="Emails" icon={'\u2709\uFE0F'} count={data.emails.length}>
          {data.emails.length === 0
            ? <EmptyState text="No related emails found (Kenaz not running?)" />
            : data.emails.map((thread: any) => (
              <EmailRow key={thread.id} thread={thread} />
            ))
          }
        </ContextSection>

        {/* Tasks */}
        <ContextSection title="Tasks" icon={'\u2611\uFE0F'} count={data.tasks.length}>
          {data.tasks.length === 0
            ? <EmptyState text="No related tasks found (Raido not running?)" />
            : data.tasks.map((task: any) => (
              <TaskRow key={task.id} task={task} />
            ))
          }
        </ContextSection>

        {/* Events */}
        <ContextSection title="Events" icon={'\uD83D\uDCC5'} count={data.events.length}>
          {data.events.length === 0
            ? <EmptyState text="No related events found (Dagaz not running?)" />
            : data.events.map((event: any) => (
              <EventRow key={event.id || event.gcal_id} event={event} />
            ))
          }
        </ContextSection>
      </div>
    </div>
  );
}

function ContextSection({ title, icon, count, defaultOpen = false, children }: {
  title: string;
  icon: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || count > 0);

  return (
    <div className="border-b border-border-subtle">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-3 flex items-center gap-2 hover:bg-bg-hover transition-colors"
      >
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex-1 text-left">
          {title}
        </span>
        <span className="text-xs text-text-muted">{count}</span>
        <svg className={`w-3 h-3 text-text-muted transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-6 py-4 text-xs text-text-muted">{text}</div>;
}

function NoteRow({ note, onClick }: { note: NoteSummary; onClick: () => void }) {
  return (
    <div onClick={onClick} className="note-item">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm truncate">{note.title}</span>
          {note.type && <span className="tag-pill">{note.type}</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {note.date && <span className="text-xs text-text-muted">{note.date}</span>}
          <span className="text-xs text-text-muted">{note.word_count} words</span>
        </div>
      </div>
    </div>
  );
}

function EmailRow({ thread }: { thread: any }) {
  const from = thread.from?.name || thread.from?.email || 'Unknown';
  return (
    <div className="px-6 py-2.5 border-b border-border-subtle/50 last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-primary truncate flex-1">{thread.subject || '(no subject)'}</span>
        {thread.unread && <span className="w-1.5 h-1.5 rounded-full bg-accent-primary flex-shrink-0" />}
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-xs text-text-muted">
        <span>{from}</span>
        {thread.date && <span>{formatDate(thread.date)}</span>}
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: any }) {
  const isCompleted = task.status === 'completed';
  return (
    <div className="px-6 py-2.5 border-b border-border-subtle/50 last:border-0 flex items-start gap-2">
      <span className={`text-xs mt-0.5 ${isCompleted ? 'text-accent-primary' : 'text-text-muted'}`}>
        {isCompleted ? '\u2705' : '\u25CB'}
      </span>
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${isCompleted ? 'line-through text-text-muted' : 'text-text-primary'}`}>
          {task.title}
        </span>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-text-muted">
          {task.due_date && <span>Due: {task.due_date}</span>}
          {task.priority > 0 && <span className="tag-pill">P{task.priority}</span>}
        </div>
      </div>
    </div>
  );
}

function EventRow({ event }: { event: any }) {
  const start = event.start?.dateTime || event.start?.date || event.start || '';
  return (
    <div className="px-6 py-2.5 border-b border-border-subtle/50 last:border-0">
      <span className="text-sm text-text-primary">{event.summary || '(no title)'}</span>
      <div className="flex items-center gap-2 mt-0.5 text-xs text-text-muted">
        {start && <span>{formatDate(start)}</span>}
        {event.location && <span>{event.location}</span>}
      </div>
    </div>
  );
}
