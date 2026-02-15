import React, { useRef, useEffect } from 'react';

interface Props {
  query: string;
  onSearch: (query: string) => void;
  onAdvancedSearch: () => void;
  onClear: () => void;
}

export function SearchBar({ query, onSearch, onAdvancedSearch, onClear }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="titlebar-no-drag flex items-center gap-1.5 bg-bg-primary/60 border border-border-subtle rounded-md px-2.5 py-1 w-64 focus-within:border-accent-primary/40 transition-colors">
      <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClear();
            inputRef.current?.blur();
          }
          if (e.key === 'Enter') onSearch(query);
        }}
        placeholder="Search emails..."
        className="bg-transparent text-xs text-text-primary placeholder-text-muted outline-none flex-1 min-w-0"
      />
      {query && (
        <button onClick={onClear} className="text-text-muted hover:text-text-secondary flex-shrink-0">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      <button
        onClick={onAdvancedSearch}
        className="flex-shrink-0 p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors"
        title="Advanced search (/)"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      </button>
    </div>
  );
}
