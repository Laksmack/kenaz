import React, { useState, useMemo } from 'react';
import type { Task } from '../../shared/types';
import { cn, formatDate, getDateColor } from '../lib/utils';

interface TaskListProps {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (task: Task) => void;
  onComplete: (id: string) => void;
  loading: boolean;
  title: string;
}

export function TaskList({ tasks, selectedId, onSelect, onComplete, loading, title }: TaskListProps) {
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const task of tasks) {
      if (task.tags) {
        for (const tag of task.tags) tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (activeTags.size === 0) return tasks;
    return tasks.filter(task =>
      task.tags && Array.from(activeTags).every(tag => task.tags!.includes(tag))
    );
  }, [tasks, activeTags]);

  const toggleTag = (tag: string) => {
    setActiveTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <span className="text-xs text-text-muted">{filteredTasks.length} tasks</span>
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="px-4 py-2 border-b border-border-subtle flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setActiveTags(new Set())}
            className={cn('tag-filter-btn', activeTags.size === 0 && 'active')}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={cn('tag-filter-btn', activeTags.has(tag) && 'active')}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <div className="text-3xl mb-2">✨</div>
            <div className="text-sm">No tasks here</div>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <div
              key={task.id}
              onClick={() => onSelect(task)}
              className={cn(
                'task-item',
                selectedId === task.id && 'active'
              )}
            >
              {/* Checkbox */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onComplete(task.id);
                }}
                className={cn(
                  'w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 transition-colors flex items-center justify-center',
                  task.status === 'completed'
                    ? 'border-accent-primary bg-accent-primary/20'
                    : 'border-[#3a3228] hover:border-accent-primary hover:bg-accent-primary/5'
                )}
              >
                {task.status === 'completed' && (
                  <svg className="w-2.5 h-2.5 text-accent-primary" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M6.5 11.5L3 8l1-1 2.5 2.5 5-5 1 1-6 6z" />
                  </svg>
                )}
              </button>

              {/* Title + inline tags */}
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className={cn(
                  'text-sm truncate',
                  task.status === 'completed' && 'line-through text-text-muted'
                )}>
                  {task.title}
                </span>
                {task.tags && task.tags.length > 0 && (
                  <div className="flex gap-1 flex-shrink-0">
                    {task.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="tag-pill">{tag}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Due date (right-aligned) — thermal color scale */}
              {task.due_date && (() => {
                const { color, bold } = getDateColor(task.due_date);
                return (
                  <span
                    className="text-xs flex-shrink-0 ml-2 tabular-nums"
                    style={{ color, fontWeight: bold ? 700 : 400 }}
                  >
                    {formatDate(task.due_date)}
                  </span>
                );
              })()}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
