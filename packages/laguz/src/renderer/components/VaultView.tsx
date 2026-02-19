import React, { useState, useEffect, useCallback } from 'react';
import { NoteList } from './NoteList';
import { NoteDetail } from './NoteDetail';
import { useSearch, useRecent } from '../hooks/useNotes';
import type { NoteSummary } from '../types';

interface VaultViewProps {
  searchQuery: string;
}

export function VaultView({ searchQuery }: VaultViewProps) {
  const { results: searchResults, loading: searchLoading, search } = useSearch();
  const { notes: recentNotes, loading: recentLoading } = useRecent();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    if (searchQuery.trim()) {
      search(searchQuery);
    }
  }, [searchQuery, search]);

  const isSearching = searchQuery.trim().length > 0;
  const notes = isSearching ? searchResults : recentNotes;
  const loading = isSearching ? searchLoading : recentLoading;

  const handleSelect = useCallback((note: NoteSummary) => {
    setSelectedPath(note.path);
  }, []);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Note list */}
      <div className="w-2/5 min-w-[280px] max-w-[450px] border-r border-border-subtle flex flex-col">
        <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            {isSearching ? 'Search Results' : 'Recent Notes'}
          </h2>
          <span className="text-xs text-text-muted">{notes.length} notes</span>
        </div>
        <NoteList
          notes={notes}
          selectedPath={selectedPath}
          onSelect={handleSelect}
          loading={loading}
          emptyMessage={isSearching ? 'No results' : 'No notes in vault'}
          showCompany
        />
      </div>

      {/* Note detail */}
      <NoteDetail notePath={selectedPath} />
    </div>
  );
}
