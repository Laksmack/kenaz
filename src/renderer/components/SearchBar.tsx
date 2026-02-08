import React, { useRef, useEffect } from 'react';

interface Props {
  active: boolean;
  query: string;
  onSearch: (query: string) => void;
  onActivate: () => void;
  onClose: () => void;
}

export function SearchBar({ active, query, onSearch, onActivate, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active && inputRef.current) {
      inputRef.current.focus();
    }
  }, [active]);

  if (!active) {
    return (
      <button
        onClick={onActivate}
        className="titlebar-no-drag flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span>Search</span>
        <kbd className="shortcut-key text-[10px]">/</kbd>
      </button>
    );
  }

  return (
    <div className="titlebar-no-drag flex items-center gap-2 bg-bg-primary border border-border-subtle rounded-md px-3 py-1">
      <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter') onSearch(query);
        }}
        placeholder="Search emails... (Gmail syntax)"
        className="bg-transparent text-xs text-text-primary placeholder-text-muted outline-none w-48"
      />
      <button onClick={onClose} className="text-text-muted hover:text-text-secondary">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
