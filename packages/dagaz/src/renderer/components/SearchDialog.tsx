import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { CalendarEvent } from '../../shared/types';
import { formatTime, parseLocalDate } from '../lib/utils';
import { eventDisplayColor } from '../lib/calendar-colors';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onNavigateToDate: (date: Date) => void;
}

const SEARCH_DEBOUNCE_MS = 280;

export function SearchDialog({ open, onClose, onSelectEvent, onNavigateToDate }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CalendarEvent[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setSearching(false);
      requestIdRef.current += 1;
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }
    const myId = ++requestIdRef.current;
    setSearching(true);
    try {
      const events = await window.dagaz.searchEvents(trimmed, 25);
      if (myId !== requestIdRef.current) return;
      setResults(events || []);
      setSelectedIndex(0);
    } catch (e) {
      console.error('[SearchDialog] search failed:', e);
      if (myId === requestIdRef.current) {
        setResults([]);
      }
    } finally {
      if (myId === requestIdRef.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      const event = results[selectedIndex];
      const date = event.all_day ? parseLocalDate(event.start_date || event.start_time) : new Date(event.start_time);
      onNavigateToDate(date);
      onSelectEvent(event);
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-[480px] bg-bg-secondary border border-border-subtle rounded-xl shadow-2xl overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
          <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search title, location, people…"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
          />
          {searching && <span className="text-[10px] text-text-muted whitespace-nowrap">Searching…</span>}
          <kbd className="text-[10px] text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded">Esc</kbd>
        </div>
        {results.length > 0 && (
          <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
            {results.map((event, i) => {
              const date = event.all_day ? parseLocalDate(event.start_date || event.start_time) : new Date(event.start_time);
              return (
                <button
                  key={event.id}
                  type="button"
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                    i === selectedIndex ? 'bg-accent-primary/10' : 'hover:bg-bg-hover'
                  }`}
                  onClick={() => {
                    onNavigateToDate(date);
                    onSelectEvent(event);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: eventDisplayColor(event) }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-text-primary truncate">{event.summary || '(No title)'}</div>
                    <div className="text-[10px] text-text-muted">
                      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {!event.all_day && ` · ${formatTime(event.start_time)}`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {query.trim() && !searching && results.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-text-muted">
            No events matched in the last six months (visible calendars only).
          </div>
        )}
      </div>
    </div>
  );
}
