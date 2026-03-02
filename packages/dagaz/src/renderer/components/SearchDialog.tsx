import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { CalendarEvent } from '../../shared/types';
import { formatTime } from '../lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onNavigateToDate: (date: Date) => void;
}

export function SearchDialog({ open, onClose, onSelectEvent, onNavigateToDate }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CalendarEvent[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    // Search a broad date range: 6 months back to 6 months forward
    const now = new Date();
    const start = new Date(now);
    start.setMonth(start.getMonth() - 6);
    const end = new Date(now);
    end.setMonth(end.getMonth() + 6);

    const events = await window.dagaz.getEvents(start.toISOString(), end.toISOString());
    const lower = q.toLowerCase();
    const filtered = (events || []).filter((e: CalendarEvent) =>
      e.summary?.toLowerCase().includes(lower) ||
      e.description?.toLowerCase().includes(lower) ||
      e.location?.toLowerCase().includes(lower) ||
      e.attendees?.some(a => a.display_name?.toLowerCase().includes(lower) || a.email.toLowerCase().includes(lower))
    ).slice(0, 20);
    setResults(filtered);
    setSelectedIndex(0);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      const event = results[selectedIndex];
      const date = new Date(event.all_day ? (event.start_date || event.start_time) : event.start_time);
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
            placeholder="Search events..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
          />
          <kbd className="text-[10px] text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded">Esc</kbd>
        </div>
        {results.length > 0 && (
          <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
            {results.map((event, i) => {
              const date = new Date(event.all_day ? (event.start_date || event.start_time) : event.start_time);
              return (
                <button
                  key={event.id}
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
                    style={{ backgroundColor: event.calendar_color || '#4A9AC2' }}
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
        {query.trim() && results.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-text-muted">No events found</div>
        )}
      </div>
    </div>
  );
}
