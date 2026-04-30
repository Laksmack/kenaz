import React, { useRef, useImperativeHandle, forwardRef } from 'react';

export type SearchBarHandle = { focus: () => void; blur: () => void };

interface Props {
  query: string;
  onChange: (value: string) => void;
  /** Run search immediately (Enter). */
  onCommit: () => void;
  onAdvancedSearch: () => void;
  onClear: () => void;
  /** True when the box has text but the list is still on the previous committed query (debounce). */
  pendingCommit?: boolean;
}

export const SearchBar = forwardRef<SearchBarHandle, Props>(function SearchBar(
  { query, onChange, onCommit, onAdvancedSearch, onClear, pendingCommit = false }: Props,
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
    },
    blur: () => {
      inputRef.current?.blur();
    },
  }));

  return (
    <div className="titlebar-no-drag flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 bg-bg-primary/60 border border-border-subtle rounded-md px-2.5 py-1 w-64 focus-within:border-accent-primary/40 transition-colors">
        <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onClear();
              inputRef.current?.blur();
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              onCommit();
            }
          }}
          placeholder="Search mail…"
          title="Type and pause to search, or press Enter to run immediately. Shortcut: /"
          className="bg-transparent text-xs text-text-primary placeholder-text-muted outline-none flex-1 min-w-0"
        />
        {query && (
          <button type="button" onClick={onClear} className="text-text-muted hover:text-text-secondary flex-shrink-0" aria-label="Clear search">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={onAdvancedSearch}
          className="flex-shrink-0 p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors"
          title="Advanced search"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </button>
      </div>
      {pendingCommit && (
        <p className="text-[10px] text-text-muted leading-tight pl-0.5 max-w-[16rem]">
          Press <kbd className="px-1 py-px rounded bg-bg-tertiary border border-border-subtle font-mono">Enter</kbd> to search now, or keep typing
        </p>
      )}
    </div>
  );
});
