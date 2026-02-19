import React, { useState, useCallback } from 'react';
import { NoteDetail } from './NoteDetail';
import { useFolderNotes } from '../hooks/useNotes';
import { formatName } from '../lib/formatName';
import type { NoteSummary } from '../types';

interface FolderViewProps {
  path: string | null;
}

export function FolderView({ path }: FolderViewProps) {
  const { notes, loading } = useFolderNotes(path);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const handleSelect = useCallback((note: NoteSummary) => {
    setSelectedPath(note.path);
  }, []);

  if (!path) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <div className="text-center">
          <div className="text-3xl mb-2">📁</div>
          <div className="text-sm">Select a folder from the sidebar</div>
        </div>
      </div>
    );
  }

  const folderName = path.split('/').pop() || path;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Note list */}
      <div className="w-2/5 min-w-[280px] max-w-[450px] border-r border-border-subtle flex flex-col overflow-y-auto scrollbar-hide">
        <div className="px-4 py-3 border-b border-border-subtle">
          <h2 className="text-sm font-semibold text-text-primary">{formatName(folderName)}</h2>
          <span className="text-xs text-text-muted">{notes.length} notes</span>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-center text-text-muted text-sm">Loading...</div>
        ) : notes.length === 0 ? (
          <div className="px-4 py-6 text-center text-text-muted text-sm">No notes in this folder</div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              onClick={() => handleSelect(note)}
              className={`note-item ${selectedPath === note.path ? 'active' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm truncate">{note.title}</span>
                  {note.type && <span className="tag-pill">{note.type}</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {note.date && <span className="text-xs text-text-muted">{note.date}</span>}
                  {note.modified && (
                    <span className="text-xs text-text-muted">
                      · {new Date(note.modified).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Note detail */}
      <NoteDetail notePath={selectedPath} />
    </div>
  );
}
