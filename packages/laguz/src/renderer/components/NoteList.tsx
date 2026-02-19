import React, { useState, useRef, useEffect } from 'react';
import { cn, formatShortDate } from '../lib/utils';
import type { NoteSummary } from '../types';
import { createDraftFromNote, createEventFromNote, createTodoFromNote, type NoteContext } from '@futhark/core/lib/crossApp';

interface NoteListProps {
  notes: NoteSummary[];
  selectedPath: string | null;
  onSelect: (note: NoteSummary) => void;
  loading?: boolean;
  emptyMessage?: string;
  showCompany?: boolean;
}

export function NoteList({ notes, selectedPath, onSelect, loading, emptyMessage, showCompany = false }: NoteListProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; note: NoteSummary } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [contextMenu]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
        <div className="text-3xl mb-2">ᛚ</div>
        <div className="text-sm">{emptyMessage || 'No notes'}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide relative">
      {notes.map((note) => (
        <div
          key={note.id}
          onClick={() => onSelect(note)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, note }); }}
          className={cn(
            'note-item',
            selectedPath === note.path && 'active'
          )}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm truncate">{note.title}</span>
              {note.type && (
                <span className="tag-pill">{note.type}</span>
              )}
              {note.processed === 0 && note.type === 'meeting' && (
                <span className="badge-unprocessed">unprocessed</span>
              )}
              {note.processed === 1 && note.type === 'meeting' && (
                <span className="badge-processed">processed</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {showCompany && note.company && (
                <span className="text-xs text-text-muted">{note.company}</span>
              )}
              {note.date && (
                <span className="text-xs text-text-muted">{formatShortDate(note.date)}</span>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Context Menu */}
      {contextMenu && (() => {
        const note = contextMenu.note;
        const ctx: NoteContext = { path: note.path, title: note.title, content: '', type: note.type, company: note.company, date: note.date };
        const fetcher = window.laguz.crossAppFetch;
        const actions = [
          { label: 'Draft Email in Kenaz', icon: 'ᚲ', fn: async () => {
            try {
              const full = await window.laguz.getNote(note.path);
              const fullCtx = { ...ctx, content: full?.content || '' };
              await createDraftFromNote(fetcher, fullCtx);
              // no notify on laguz — it doesn't have one, so we just succeed silently
            } catch {}
          }},
          { label: 'Create Event in Dagaz', icon: 'ᛞ', fn: async () => { try { await createEventFromNote(fetcher, ctx); } catch {} } },
          { label: 'Create Todo in Raidō', icon: 'ᚱ', fn: async () => { try { await createTodoFromNote(fetcher, ctx); } catch {} } },
        ];
        return (
          <div
            ref={menuRef}
            className="fixed z-50 py-1 min-w-[200px] bg-bg-secondary border border-border-subtle rounded-lg shadow-2xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={() => { a.fn(); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
              >
                <span className="w-4 text-center">{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
