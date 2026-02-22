import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { NoteList } from './NoteList';
import { useSearch, useRecent } from '../hooks/useNotes';
import type { NoteSummary } from '../types';

interface VaultViewProps {
  searchQuery: string;
  activeFilePath: string | null;
  onOpenFile: (path: string, inNewTab?: boolean) => void;
}

function vaultFileToSummary(f: { path: string; filename: string; ext: string; modified: string; size: number }): NoteSummary {
  return {
    id: f.path,
    path: f.path,
    title: f.filename,
    type: f.ext.toUpperCase(),
    subtype: null,
    company: null,
    date: f.modified.split('T')[0],
    created: f.modified,
    modified: f.modified,
    processed: 0,
    word_count: 0,
    tags: [f.ext],
  };
}

export function VaultView({ searchQuery, activeFilePath, onOpenFile }: VaultViewProps) {
  const { results: searchResults, loading: searchLoading, search } = useSearch();
  const { notes: recentNotes, loading: recentLoading, refresh: refreshRecent } = useRecent();
  const [pdfFiles, setPdfFiles] = useState<NoteSummary[]>([]);
  const [newFileRequested, setNewFileRequested] = useState(false);

  useEffect(() => {
    window.laguz.getVaultFiles('pdf').then(files => {
      setPdfFiles(files.map(vaultFileToSummary));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      search(searchQuery);
    }
  }, [searchQuery, search]);

  const isSearching = searchQuery.trim().length > 0;

  const notes = useMemo(() => {
    const base = isSearching ? searchResults : recentNotes;
    if (isSearching) return base;
    // Merge PDFs into the recent list, deduplicate by path, sort by modified
    const pathSet = new Set(base.map(n => n.path));
    const merged = [...base, ...pdfFiles.filter(p => !pathSet.has(p.path))];
    merged.sort((a, b) => (b.modified || '').localeCompare(a.modified || ''));
    return merged;
  }, [isSearching, searchResults, recentNotes, pdfFiles]);

  const loading = isSearching ? searchLoading : recentLoading;

  const handleSelect = useCallback((note: NoteSummary) => {
    onOpenFile(note.path);
  }, [onOpenFile]);

  const handleRefresh = useCallback(() => {
    refreshRecent();
    window.laguz.getVaultFiles('pdf').then(files => {
      setPdfFiles(files.map(vaultFileToSummary));
    }).catch(() => {});
  }, [refreshRecent]);

  return (
    <div className="w-2/5 min-w-[280px] max-w-[450px] border-r border-border-subtle flex flex-col flex-shrink-0">
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">
          {isSearching ? 'Search Results' : 'Recent Files'}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{notes.length} items</span>
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
        emptyMessage={isSearching ? 'No results' : 'No files in vault'}
        showCompany
        onRefresh={handleRefresh}
        newFileRequested={newFileRequested}
        onNewFileDone={() => setNewFileRequested(false)}
      />
    </div>
  );
}
