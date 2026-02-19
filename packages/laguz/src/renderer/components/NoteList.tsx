import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  onRefresh?: () => void;
  basePath?: string;
  newFileRequested?: boolean;
  onNewFileDone?: () => void;
}

export function NoteList({ notes, selectedPath, onSelect, loading, emptyMessage, showCompany = false, onRefresh, basePath, newFileRequested, onNewFileDone }: NoteListProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; note: NoteSummary } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (newFileRequested) {
      setCreatingFile(true);
      setNewFileName('');
      onNewFileDone?.();
    }
  }, [newFileRequested, onNewFileDone]);

  const handleRename = useCallback(async (note: NoteSummary) => {
    const filename = note.path.split('/').pop() || '';
    setRenamingPath(note.path);
    setRenameValue(filename);
    setContextMenu(null);
    setTimeout(() => renameInputRef.current?.select(), 50);
  }, []);

  const submitRename = useCallback(async () => {
    if (!renamingPath || !renameValue.trim()) { setRenamingPath(null); return; }
    const dir = renamingPath.includes('/') ? renamingPath.split('/').slice(0, -1).join('/') + '/' : '';
    const newPath = dir + renameValue.trim();
    if (newPath !== renamingPath) {
      try { await window.laguz.renameFile(renamingPath, newPath); onRefresh?.(); } catch (e) { console.error('Rename failed:', e); }
    }
    setRenamingPath(null);
  }, [renamingPath, renameValue, onRefresh]);

  const handleDelete = useCallback(async (note: NoteSummary) => {
    setContextMenu(null);
    if (!confirm(`Delete "${note.title}"?`)) return;
    try { await window.laguz.deleteFile(note.path); onRefresh?.(); } catch (e) { console.error('Delete failed:', e); }
  }, [onRefresh]);

  const submitNewFile = useCallback(async () => {
    if (!newFileName.trim()) { setCreatingFile(false); return; }
    const name = newFileName.trim().includes('.') ? newFileName.trim() : newFileName.trim() + '.md';
    const filePath = basePath ? `${basePath}/${name}` : name;
    try { await window.laguz.createFile(filePath); onRefresh?.(); } catch (e) { console.error('Create failed:', e); }
    setCreatingFile(false);
    setNewFileName('');
  }, [newFileName, basePath, onRefresh]);

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
      {/* New file row */}
      {creatingFile && (
        <div className="px-4 py-2 border-b border-border-subtle flex items-center gap-2">
          <input
            ref={newFileInputRef}
            autoFocus
            value={newFileName}
            onChange={e => setNewFileName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitNewFile(); if (e.key === 'Escape') { setCreatingFile(false); setNewFileName(''); } }}
            onBlur={submitNewFile}
            placeholder="filename.md"
            className="flex-1 bg-bg-primary border border-accent-primary/40 rounded px-2 py-1 text-xs text-text-primary outline-none font-mono"
          />
        </div>
      )}

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
              {renamingPath === note.path ? (
                <input
                  ref={renameInputRef}
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenamingPath(null); }}
                  onBlur={submitRename}
                  onClick={e => e.stopPropagation()}
                  className="bg-bg-primary border border-accent-primary/40 rounded px-1.5 py-0.5 text-xs text-text-primary outline-none font-mono flex-1"
                />
              ) : (
                <>
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
                </>
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
          { label: 'Rename', icon: '✏', fn: async () => handleRename(note) },
          { label: 'Delete', icon: '🗑', fn: async () => handleDelete(note), danger: true },
          { type: 'separator' as const },
          { label: 'Draft Email in Kenaz', icon: 'ᚲ', fn: async () => {
            try {
              const full = await window.laguz.getNote(note.path);
              const fullCtx = { ...ctx, content: full?.content || '' };
              await createDraftFromNote(fetcher, fullCtx);
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
            {actions.map((a, i) => {
              if ('type' in a && a.type === 'separator') {
                return <div key={i} className="my-1 border-t border-border-subtle" />;
              }
              return (
                <button
                  key={i}
                  onClick={() => { a.fn!(); setContextMenu(null); }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-bg-hover transition-colors ${
                    (a as any).danger ? 'text-red-400 hover:text-red-300' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span className="w-4 text-center">{a.icon}</span>
                  {a.label}
                </button>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
