import React, { useState, useEffect, useCallback } from 'react';
import { NoteList } from './NoteList';
import { useSearch, useRecent } from '../hooks/useNotes';
import type { NoteSummary } from '../types';

interface VaultViewProps {
  searchQuery: string;
  activeFilePath: string | null;
  onOpenFile: (path: string, inNewTab?: boolean) => void;
}

export function VaultView({ searchQuery, activeFilePath, onOpenFile }: VaultViewProps) {
  const { results: searchResults, loading: searchLoading, search } = useSearch();
  const { notes: recentNotes, loading: recentLoading, refresh: refreshRecent } = useRecent();
  const [newFileRequested, setNewFileRequested] = useState(false);

  useEffect(() => {
    if (searchQuery.trim()) {
      search(searchQuery);
    }
  }, [searchQuery, search]);

  const isSearching = searchQuery.trim().length > 0;
  const notes = isSearching ? searchResults : recentNotes;
  const loading = isSearching ? searchLoading : recentLoading;

  const handleSelect = useCallback((note: NoteSummary) => {
    onOpenFile(note.path);
  }, [onOpenFile]);

  return (
    <div className="w-2/5 min-w-[280px] max-w-[450px] border-r border-border-subtle flex flex-col flex-shrink-0">
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">
          {isSearching ? 'Search Results' : 'Recent Notes'}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{notes.length} notes</span>
          <button
            onClick={() => setNewFileRequested(true)}
            className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
            title="New File"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>
      </div>
      <NoteList
        notes={notes}
        selectedPath={activeFilePath}
        onSelect={handleSelect}
        loading={loading}
        emptyMessage={isSearching ? 'No results' : 'No notes in vault'}
        showCompany
        onRefresh={refreshRecent}
        newFileRequested={newFileRequested}
        onNewFileDone={() => setNewFileRequested(false)}
      />
    </div>
  );
}
