import React, { useState, useEffect, useCallback } from 'react';
import type { Task, Project } from '../../shared/types';
import { cn, isOverdue, isToday } from '../lib/utils';

interface TaskDetailProps {
  task: Task | null;
  projects: Project[];
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}

const PRIORITY_OPTIONS = [
  { value: 0, label: 'None', color: '' },
  { value: 1, label: 'Low', color: 'priority-low' },
  { value: 2, label: 'Medium', color: 'priority-medium' },
  { value: 3, label: 'High', color: 'priority-high' },
];

export function TaskDetail({ task, projects, onUpdate, onComplete, onDelete }: TaskDetailProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setNotes(task.notes || '');
      setEditingTitle(false);
    }
  }, [task?.id]);

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
  }, [task, notes, onUpdate]);

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
              'w-6 h-6 rounded-full border-2 flex-shrink-0 mt-1 transition-colors',
              'hover:border-accent-primary hover:bg-accent-primary/10',
              task.status === 'completed'
                ? 'border-accent-success bg-accent-success/20'
                : 'border-border-subtle'
            )}
          >
            {task.status === 'completed' && (
              <svg className="w-full h-full text-accent-success" viewBox="0 0 16 16" fill="currentColor">
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
        <div className="flex items-center gap-4 mt-3 ml-9 text-xs">
          {/* Priority */}
          <select
            value={task.priority}
            onChange={(e) => onUpdate(task.id, { priority: Number(e.target.value) as any })}
            className="bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-text-secondary outline-none"
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>

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

          {/* Project */}
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted">Project:</span>
            <select
              value={task.project_id || ''}
              onChange={(e) => onUpdate(task.id, { project_id: e.target.value || null })}
              className="bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-text-secondary outline-none max-w-[150px]"
            >
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          {task.tags && task.tags.length > 0 && (
            <div className="flex gap-1">
              {task.tags.map(tag => (
                <span key={tag} className="px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary text-[10px]">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide">
        <textarea
          className="w-full h-full bg-transparent border-none outline-none text-sm text-text-primary resize-none leading-relaxed selectable placeholder-text-muted"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Add notes..."
        />
      </div>
    </div>
  );
}
