import React, { useState, useEffect, useRef } from 'react';

interface NewTaskModalProps {
  defaults?: {
    due_date?: string;
    groupPrefix?: string;
  };
  onClose: () => void;
  onCreate: (data: {
    title: string;
    notes?: string;
    due_date?: string;
    defer_until?: string;
    priority?: number;
    tags?: string[];
    recurrence?: string;
  }) => void;
}

const PRIORITY_OPTIONS = [
  { value: 0, label: 'None', color: 'var(--color-text-muted)' },
  { value: 1, label: 'Low', color: '#60a5fa' },
  { value: 2, label: 'Medium', color: '#f59e0b' },
  { value: 3, label: 'High', color: '#ef4444' },
] as const;

const RECURRENCE_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
] as const;

export function NewTaskModal({ defaults = {}, onClose, onCreate }: NewTaskModalProps) {
  const [title, setTitle] = useState(defaults.groupPrefix ? `[${defaults.groupPrefix}] ` : '');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(defaults.due_date || '');
  const [deferUntil, setDeferUntil] = useState('');
  const [priority, setPriority] = useState(0);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    if (defaults.groupPrefix) {
      titleRef.current?.setSelectionRange(title.length, title.length);
    }
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onClose]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    const data: any = { title: title.trim() };
    if (notes.trim()) data.notes = notes.trim();
    if (dueDate) data.due_date = dueDate;
    if (deferUntil) data.defer_until = deferUntil;
    if (priority > 0) data.priority = priority;
    if (tags.length > 0) data.tags = tags;
    if (recurrence) data.recurrence = recurrence;
    onCreate(data);
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-bg-secondary rounded-xl border border-border-subtle shadow-2xl w-[520px] max-h-[80vh] overflow-y-auto animate-fadeIn">
        <div className="p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-4">New Task</h2>

          {/* Title */}
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Task title..."
            className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-primary/40 mb-3"
          />

          {/* Notes */}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (markdown supported)..."
            rows={3}
            className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-primary/40 mb-4 resize-none"
          />

          {/* Date row */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary/40 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Defer Until</label>
              <input
                type="date"
                value={deferUntil}
                onChange={(e) => setDeferUntil(e.target.value)}
                className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary/40 [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Priority + Recurrence row */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Priority</label>
              <div className="flex gap-1">
                {PRIORITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPriority(opt.value)}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors border ${
                      priority === opt.value
                        ? 'border-accent-primary/40 bg-accent-primary/10'
                        : 'border-border-subtle hover:border-border-subtle hover:bg-bg-hover'
                    }`}
                    style={priority === opt.value ? { color: opt.color } : { color: 'var(--color-text-muted)' }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Repeat</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary/40"
              >
                {RECURRENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div className="mb-4">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Tags</label>
            <div className="flex items-center gap-2 flex-wrap">
              {tags.map(tag => (
                <span key={tag} className="tag-pill flex items-center gap-1">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-text-primary">
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addTag(); }
                  if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
                    setTags(tags.slice(0, -1));
                  }
                }}
                placeholder={tags.length === 0 ? 'Add tags...' : ''}
                className="flex-1 min-w-[80px] bg-transparent text-xs text-text-primary placeholder-text-muted outline-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!title.trim()}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-white brand-gradient hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Create Task
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
