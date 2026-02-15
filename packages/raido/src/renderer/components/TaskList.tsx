import React from 'react';
import type { Task } from '../../shared/types';
import { cn, formatDate, isOverdue, isToday, isDueSoon } from '../lib/utils';

interface TaskListProps {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (task: Task) => void;
  onComplete: (id: string) => void;
  loading: boolean;
  title: string;
  showDates?: boolean;
}

const PRIORITY_LABELS = ['', '!', '!!', '!!!'];

export function TaskList({ tasks, selectedId, onSelect, onComplete, loading, title, showDates = true }: TaskListProps) {
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
        <span className="text-xs text-text-muted">{tasks.length} tasks</span>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <div className="text-3xl mb-2">✨</div>
            <div className="text-sm">No tasks here</div>
          </div>
        ) : (
          tasks.map((task) => (
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
                  'w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 mt-0.5 transition-colors',
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

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {task.priority > 0 && (
                    <span className={cn(
                      'text-xs font-bold',
                      task.priority === 3 && 'priority-high',
                      task.priority === 2 && 'priority-medium',
                      task.priority === 1 && 'priority-low',
                    )}>
                      {PRIORITY_LABELS[task.priority]}
                    </span>
                  )}
                  <span className={cn(
                    'text-sm truncate',
                    task.status === 'completed' && 'line-through text-text-muted'
                  )}>
                    {task.title}
                  </span>
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-2 mt-1">
                  {showDates && task.due_date && (
                    <span className={cn(
                      'text-xs',
                      isOverdue(task.due_date) && 'text-accent-danger font-semibold',
                      !isOverdue(task.due_date) && isToday(task.due_date) && 'text-accent-primary font-medium',
                      !isOverdue(task.due_date) && !isToday(task.due_date) && isDueSoon(task.due_date) && 'text-text-secondary',
                      !isOverdue(task.due_date) && !isToday(task.due_date) && !isDueSoon(task.due_date) && 'text-text-muted',
                    )}>
                      {formatDate(task.due_date)}
                    </span>
                  )}
                  {task.tags && task.tags.length > 0 && (
                    <div className="flex gap-1">
                      {task.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
