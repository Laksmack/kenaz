import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Task } from '../../shared/types';
import { extractGroup } from '../../shared/types';
import { cn, isOverdue, isToday } from '../lib/utils';

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

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setNotes(task.notes || '');
      setEditingTitle(false);
      setEditingNotes(false);
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
    const items: { label: string; value: string; icon: string }[] = [];
    if (task.kenaz_thread_id) items.push({ label: 'Email Thread', value: task.kenaz_thread_id, icon: '📧' });
    if (task.hubspot_deal_id) items.push({ label: 'HubSpot Deal', value: task.hubspot_deal_id, icon: '💼' });
    if (task.vault_path) items.push({ label: 'Vault Note', value: task.vault_path, icon: '📝' });
    if (task.calendar_event_id) items.push({ label: 'Calendar Event', value: task.calendar_event_id, icon: '📅' });
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
              className={cn(
                'bg-bg-tertiary border border-border-subtle rounded px-2 py-1 outline-none',
                isOverdue(task.due_date) && 'text-accent-danger',
                !isOverdue(task.due_date) && isToday(task.due_date) && 'text-accent-primary',
                !isOverdue(task.due_date) && !isToday(task.due_date) && 'text-text-secondary',
              )}
            />
            {!task.due_date && (
              <span className="text-[10px] text-text-muted italic">No date — task is in Inbox</span>
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
              <span key={link.label} className="text-[10px] text-text-muted flex items-center gap-1 px-2 py-0.5 rounded bg-bg-tertiary">
                <span>{link.icon}</span>
                <span className="truncate max-w-[120px]">{link.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>

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
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:rgb(var(--bg-tertiary));padding:1px 4px;border-radius:3px;font-size:0.85em">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:1em;font-weight:600;margin-top:1em;margin-bottom:0.3em;color:rgb(var(--text-primary))">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:1.1em;font-weight:600;margin-top:1em;margin-bottom:0.3em;color:rgb(var(--text-primary))">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:1.2em;font-weight:700;margin-top:1em;margin-bottom:0.3em;color:rgb(var(--text-primary))">$1</h1>')
    .replace(/^- (.+)$/gm, '<li style="margin-left:1em;list-style:disc;margin-bottom:0.15em">$1</li>')
    .replace(/\n/g, '<br/>');
}
