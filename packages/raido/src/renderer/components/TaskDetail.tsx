import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { marked } from 'marked';
import type { Task, TaskAttachment, ChecklistItem } from '../../shared/types';
import { extractGroup } from '../../shared/types';
import { cn, isOverdue, isToday, formatDateLabel } from '../lib/utils';

const RECURRENCE_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
] as const;

// Configure marked for a clean, safe output
marked.setOptions({
  breaks: true,       // GFM line breaks (single newline → <br>)
  gfm: true,          // GitHub Flavored Markdown (tables, strikethrough, etc.)
});

interface TaskDetailProps {
  task: Task | null;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TaskDetail({ task, onUpdate, onComplete, onDelete }: TaskDetailProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemTitle, setEditingItemTitle] = useState('');

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setNotes(task.notes || '');
      setEditingTitle(false);
      setEditingNotes(false);
      setChecklist(task.checklist || []);
      window.raido.getAttachments(task.id).then(setAttachments).catch(() => setAttachments([]));
    } else {
      setAttachments([]);
      setChecklist([]);
    }
  }, [task?.id]);

  const group = useMemo(() => task ? extractGroup(task.title) : null, [task?.title]);

  const saveTitle = useCallback(() => {
    if (task && title.trim() && title !== task.title) {
      onUpdate(task.id, { title: title.trim() });
    }
    setEditingTitle(false);
  }, [task, title, onUpdate]);

  const saveNotes = useCallback(() => {
    if (task && notes !== task.notes) {
      onUpdate(task.id, { notes });
    }
    setEditingNotes(false);
  }, [task, notes, onUpdate]);

  const addTag = useCallback(() => {
    if (!task || !tagInput.trim()) return;
    const newTags = [...(task.tags || []), tagInput.trim().toLowerCase()];
    onUpdate(task.id, { tags: [...new Set(newTags)] } as any);
    setTagInput('');
  }, [task, tagInput, onUpdate]);

  const removeTag = useCallback((tag: string) => {
    if (!task) return;
    const newTags = (task.tags || []).filter(t => t !== tag);
    onUpdate(task.id, { tags: newTags } as any);
  }, [task, onUpdate]);

  const links = useMemo(() => {
    if (!task) return [];
    const items: { label: string; value: string; icon: string; app: string; action: () => void }[] = [];
    if (task.kenaz_thread_id) items.push({
      label: 'Email Thread', value: 'Open in Kenaz', icon: '📧', app: 'kenaz',
      action: async () => {
        try {
          await window.raido.crossAppFetch('http://localhost:3141/api/navigate', {
            method: 'POST',
            body: JSON.stringify({ action: 'focus-thread', threadId: task.kenaz_thread_id }),
          });
        } catch { window.raido.notify('Kenaz', 'Could not open thread — is Kenaz running?'); }
      },
    });
    if (task.hubspot_deal_id) items.push({
      label: 'HubSpot Deal', value: task.hubspot_deal_id, icon: '💼', app: 'hubspot',
      action: () => {},
    });
    if (task.vault_path) items.push({
      label: 'Vault Note', value: 'Open in Laguz', icon: '📝', app: 'laguz',
      action: async () => {
        try {
          await window.raido.crossAppFetch('http://localhost:3144/api/navigate', {
            method: 'POST',
            body: JSON.stringify({ action: 'focus-note', path: task.vault_path }),
          });
        } catch { window.raido.notify('Laguz', 'Could not open note — is Laguz running?'); }
      },
    });
    if (task.calendar_event_id) items.push({
      label: 'Calendar Event', value: 'Open in Dagaz', icon: '📅', app: 'dagaz',
      action: async () => {
        try {
          await window.raido.crossAppFetch('http://localhost:3143/api/navigate', {
            method: 'POST',
            body: JSON.stringify({ action: 'focus-event', eventId: task.calendar_event_id }),
          });
        } catch { window.raido.notify('Dagaz', 'Could not open event — is Dagaz running?'); }
      },
    });
    return items;
  }, [task]);

  if (!task) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <div className="text-center">
          <div className="text-4xl mb-3">ᚱ</div>
          <div className="text-sm">Select a task to view details</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Task header */}
      <div className="px-6 py-4 border-b border-border-subtle">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <button
            onClick={() => onComplete(task.id)}
            className={cn(
              'w-6 h-6 rounded-full border-2 flex-shrink-0 mt-1 transition-colors flex items-center justify-center',
              task.status === 'completed'
                ? 'border-accent-primary bg-accent-primary/20'
                : 'border-[#3a3228] hover:border-accent-primary hover:bg-accent-primary/5'
            )}
          >
            {task.status === 'completed' && (
              <svg className="w-3.5 h-3.5 text-accent-primary" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.5 11.5L3 8l1-1 2.5 2.5 5-5 1 1-6 6z" />
              </svg>
            )}
          </button>

          {/* Title */}
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                className="w-full text-lg font-semibold bg-transparent border-none outline-none text-text-primary"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') { setTitle(task.title); setEditingTitle(false); }
                }}
                autoFocus
              />
            ) : (
              <h1
                className={cn(
                  'text-lg font-semibold cursor-text',
                  task.status === 'completed' && 'line-through text-text-muted'
                )}
                onClick={() => setEditingTitle(true)}
              >
                {task.title}
              </h1>
            )}

            {/* Group indicator */}
            {group && (
              <div className="mt-1 text-xs text-text-muted flex items-center gap-1.5">
                <span className="opacity-60">⌐</span>
                <span>{group}</span>
              </div>
            )}
          </div>

          {/* Copy reference */}
          <button
            onClick={() => navigator.clipboard.writeText(`[${task.title}] (raido:task:${task.id})`)}
            className="p-1.5 rounded hover:bg-bg-hover text-text-muted/40 hover:text-text-secondary transition-colors"
            title="Copy reference"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>

          {/* Delete button */}
          <button
            onClick={() => onDelete(task.id)}
            className="p-1.5 rounded hover:bg-bg-hover text-text-muted hover:text-accent-danger transition-colors"
            title="Delete task"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-3 mt-3 ml-9 text-xs">
          {/* Due date */}
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted">Due:</span>
            <input
              type="date"
              value={task.due_date || ''}
              onChange={(e) => onUpdate(task.id, { due_date: e.target.value || null })}
              className="bg-bg-tertiary border border-border-subtle rounded px-2 py-1 outline-none text-text-secondary"
            />
            {task.due_date && (() => {
              const label = formatDateLabel(task.due_date);
              if (!label) return null;
              const color = isOverdue(task.due_date)
                ? 'var(--color-urgency)'
                : isToday(task.due_date)
                  ? 'var(--color-current)'
                  : 'rgb(var(--text-secondary))';
              return <span className="text-[11px] font-medium" style={{ color }}>{label}</span>;
            })()}
            {!task.due_date && (
              <span className="text-[10px] text-text-muted italic">No date — task is in Inbox</span>
            )}
          </div>

          {/* Recurrence */}
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted">Repeat:</span>
            <select
              value={task.recurrence || ''}
              onChange={(e) => onUpdate(task.id, { recurrence: e.target.value || null } as any)}
              className="bg-bg-tertiary border border-border-subtle rounded px-2 py-1 outline-none text-text-secondary text-xs"
            >
              {RECURRENCE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {task.recurrence && (
              <span className="text-[11px] text-accent-primary">🔁</span>
            )}
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3 ml-9">
          {task.tags && task.tags.map(tag => (
            <span
              key={tag}
              className="tag-pill flex items-center gap-1 cursor-pointer group"
              onClick={() => removeTag(tag)}
            >
              {tag}
              <svg className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTag();
              if (e.key === 'Escape') setTagInput('');
            }}
            placeholder="+ tag"
            className="bg-transparent border-none outline-none text-xs text-text-muted placeholder-text-muted/50 w-16"
          />
        </div>

        {/* Linked resources */}
        {links.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3 ml-9">
            {links.map(link => (
              <button
                key={link.label}
                onClick={link.action}
                className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded bg-bg-tertiary transition-colors hover:bg-accent-primary/15 hover:text-accent-primary text-text-muted"
                title={link.label}
              >
                <span>{link.icon}</span>
                <span>{link.value}</span>
                <svg className="w-2.5 h-2.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            ))}
          </div>
        )}

        {/* Attachments */}
        <div className="mt-3 ml-9">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">Attachments</span>
            <button
              onClick={async () => {
                const att = await window.raido.addAttachment(task.id);
                if (att) setAttachments(prev => [...prev, att]);
              }}
              className="text-[10px] flex items-center gap-0.5 text-text-muted hover:text-accent-primary transition-colors"
              title="Attach file"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <span>Attach</span>
            </button>
          </div>
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachments.map(att => (
                <div key={att.id} className="group flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-bg-tertiary border border-border-subtle">
                  <span className="text-text-muted">{getFileIcon(att.mime_type)}</span>
                  <button
                    onClick={() => window.raido.openAttachment(task.id, att.id)}
                    className="text-text-secondary hover:text-accent-primary transition-colors truncate max-w-[140px]"
                    title={`${att.filename} (${formatFileSize(att.size)})`}
                  >
                    {att.filename}
                  </button>
                  <span className="text-[9px] text-text-muted">{formatFileSize(att.size)}</span>
                  <button
                    onClick={async () => {
                      await window.raido.deleteAttachment(task.id, att.id);
                      setAttachments(prev => prev.filter(a => a.id !== att.id));
                    }}
                    className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent-danger transition-all p-0.5"
                    title="Remove attachment"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Checklist */}
      {(checklist.length > 0 || task.status === 'open') && (
        <div className="px-6 py-3 border-b border-border-subtle">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">
            Checklist
            {checklist.length > 0 && (
              <span className="ml-1.5 normal-case tracking-normal">
                ({checklist.filter(i => i.completed).length}/{checklist.length})
              </span>
            )}
          </div>
          <div className="space-y-1">
            {checklist.map(item => (
              <div key={item.id} className="group flex items-center gap-2 py-0.5">
                <button
                  onClick={async () => {
                    const updated = await window.raido.updateChecklistItem(item.id, { completed: !item.completed });
                    if (updated) setChecklist(prev => prev.map(i => i.id === item.id ? updated : i));
                  }}
                  className={cn(
                    'w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors',
                    item.completed
                      ? 'border-accent-primary bg-accent-primary/20'
                      : 'border-[#3a3228] hover:border-accent-primary'
                  )}
                >
                  {item.completed && (
                    <svg className="w-2.5 h-2.5 text-accent-primary" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M6.5 11.5L3 8l1-1 2.5 2.5 5-5 1 1-6 6z" />
                    </svg>
                  )}
                </button>
                {editingItemId === item.id ? (
                  <input
                    className="flex-1 bg-transparent border-none outline-none text-xs text-text-primary"
                    value={editingItemTitle}
                    onChange={(e) => setEditingItemTitle(e.target.value)}
                    onBlur={async () => {
                      if (editingItemTitle.trim() && editingItemTitle !== item.title) {
                        const updated = await window.raido.updateChecklistItem(item.id, { title: editingItemTitle.trim() });
                        if (updated) setChecklist(prev => prev.map(i => i.id === item.id ? updated : i));
                      }
                      setEditingItemId(null);
                    }}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setEditingItemId(null);
                    }}
                    autoFocus
                  />
                ) : (
                  <span
                    className={cn(
                      'flex-1 text-xs cursor-text',
                      item.completed && 'line-through text-text-muted'
                    )}
                    onClick={() => { setEditingItemId(item.id); setEditingItemTitle(item.title); }}
                  >
                    {item.title}
                  </span>
                )}
                <button
                  onClick={async () => {
                    await window.raido.deleteChecklistItem(item.id);
                    setChecklist(prev => prev.filter(i => i.id !== item.id));
                  }}
                  className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent-danger transition-all p-0.5"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          {task.status === 'open' && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="w-4 h-4 flex items-center justify-center text-text-muted text-xs">+</span>
              <input
                type="text"
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && newItemTitle.trim()) {
                    const item = await window.raido.addChecklistItem(task.id, newItemTitle.trim());
                    setChecklist(prev => [...prev, item]);
                    setNewItemTitle('');
                  }
                  if (e.key === 'Escape') setNewItemTitle('');
                }}
                placeholder="Add item..."
                className="flex-1 bg-transparent border-none outline-none text-xs text-text-muted placeholder-text-muted/50"
              />
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide">
        {editingNotes ? (
          <textarea
            className="w-full h-full bg-transparent border-none outline-none text-sm text-text-primary resize-none leading-relaxed selectable placeholder-text-muted font-mono"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Add notes (markdown supported)..."
            autoFocus
          />
        ) : (
          <div
            className="text-sm text-text-primary leading-relaxed selectable cursor-text min-h-[100px]"
            onClick={() => setEditingNotes(true)}
          >
            {notes ? (
              <div className="prose-raido" dangerouslySetInnerHTML={{ __html: renderMarkdown(notes) }} />
            ) : (
              <span className="text-text-muted">Add notes...</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function renderMarkdown(text: string): string {
  const normalized = text.replace(/\\n/g, '\n');
  return marked.parse(normalized, { async: false }) as string;
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽';
  if (mimeType.includes('document') || mimeType.includes('word') || mimeType.includes('text/')) return '📃';
  if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compress')) return '📦';
  return '📎';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
