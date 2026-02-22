import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Calendar, CreateEventInput, ParsedEventInput, OverlayPerson } from '../../shared/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (data: CreateEventInput) => void;
  calendars: Calendar[];
  defaultCalendarId: string | null;
  defaultStart?: Date;
  defaultEnd?: Date;
  defaultAttendees?: OverlayPerson[];
}

export function QuickCreate({ open, onClose, onCreate, calendars, defaultCalendarId, defaultStart, defaultEnd, defaultAttendees }: Props) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedEventInput | null>(null);
  const [calendarId, setCalendarId] = useState(defaultCalendarId || '');
  const [addConferencing, setAddConferencing] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [showStructured, setShowStructured] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const parseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      const attendees = defaultAttendees?.filter(p => p.visible).map(p => p.email);
      if (defaultStart && defaultEnd) {
        setShowStructured(true);
        setParsed({
          summary: '',
          start: defaultStart.toISOString(),
          end: defaultEnd.toISOString(),
          attendees: attendees?.length ? attendees : undefined,
        });
      } else if (attendees?.length) {
        setShowStructured(true);
        const start = new Date();
        start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        setParsed({ summary: '', start: start.toISOString(), end: end.toISOString(), attendees });
      }
    } else {
      setText('');
      setParsed(null);
      setShowStructured(false);
    }
  }, [open, defaultStart, defaultEnd, defaultAttendees]);

  useEffect(() => {
    if (!calendarId && calendars.length > 0) {
      const primary = calendars.find(c => c.primary_calendar);
      setCalendarId(primary?.id || calendars[0].id);
    }
  }, [calendars, calendarId]);

  const handleTextChange = useCallback((value: string) => {
    setText(value);
    if (parseTimeout.current) clearTimeout(parseTimeout.current);

    if (value.trim().length > 5) {
      parseTimeout.current = setTimeout(async () => {
        setIsParsing(true);
        try {
          const result = await window.dagaz.parseEvent(value);
          if (result) {
            setParsed(result);
            setShowStructured(true);
          }
        } catch {
          // Parsing failed silently
        } finally {
          setIsParsing(false);
        }
      }, 500);
    } else {
      setParsed(null);
      setShowStructured(false);
    }
  }, []);

  const handleSubmit = useCallback(() => {
    if (!parsed && !text.trim()) return;

    const data: CreateEventInput = parsed
      ? {
          summary: parsed.summary,
          start: parsed.start,
          end: parsed.end,
          location: parsed.location,
          attendees: parsed.attendees,
          calendar_id: calendarId || undefined,
          add_conferencing: addConferencing,
        }
      : {
          summary: text.trim(),
          start: defaultStart?.toISOString() || new Date().toISOString(),
          end: defaultEnd?.toISOString() || new Date(Date.now() + 3600000).toISOString(),
          attendees: defaultAttendees?.filter(p => p.visible).map(p => p.email),
          calendar_id: calendarId || undefined,
          add_conferencing: addConferencing,
        };

    onCreate(data);
    onClose();
  }, [parsed, text, calendarId, addConferencing, onCreate, onClose]);

  if (!open) return null;

  const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const fromLocalInput = (val: string) => new Date(val).toISOString();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-bg-secondary border border-border-subtle rounded-xl shadow-2xl w-[480px] animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="p-4">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={e => handleTextChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSubmit();
              if (e.key === 'Escape') onClose();
            }}
            placeholder='Type something like "Team standup tomorrow at 9am for 30 min"'
            className="w-full bg-transparent border-none outline-none text-sm text-text-primary placeholder-text-muted"
          />
        </div>

        {/* Parsed preview */}
        {showStructured && parsed && (
          <div className="px-4 pb-3 border-t border-border-subtle pt-3 space-y-2">
            {isParsing && (
              <div className="text-[10px] text-text-muted">Parsing...</div>
            )}

            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              <span className="text-text-muted">Title</span>
              <input
                type="text"
                value={parsed.summary}
                onChange={e => setParsed(p => p ? { ...p, summary: e.target.value } : null)}
                className="bg-bg-primary border border-border-subtle rounded px-2 py-1 text-text-primary outline-none focus:border-accent-primary/40"
              />

              <span className="text-text-muted">Start</span>
              <input
                type="datetime-local"
                value={toLocalInput(parsed.start)}
                onChange={e => setParsed(p => p ? { ...p, start: fromLocalInput(e.target.value) } : null)}
                className="bg-bg-primary border border-border-subtle rounded px-2 py-1 text-text-primary outline-none focus:border-accent-primary/40"
              />

              <span className="text-text-muted">End</span>
              <input
                type="datetime-local"
                value={toLocalInput(parsed.end)}
                onChange={e => setParsed(p => p ? { ...p, end: fromLocalInput(e.target.value) } : null)}
                className="bg-bg-primary border border-border-subtle rounded px-2 py-1 text-text-primary outline-none focus:border-accent-primary/40"
              />

              {parsed.location && (
                <>
                  <span className="text-text-muted">Location</span>
                  <span className="text-text-primary py-1">{parsed.location}</span>
                </>
              )}

              {parsed.attendees && parsed.attendees.length > 0 && (
                <>
                  <span className="text-text-muted">Attendees</span>
                  <span className="text-text-primary py-1">{parsed.attendees.join(', ')}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Options and submit */}
        <div className="px-4 py-3 border-t border-border-subtle flex items-center gap-3">
          <select
            value={calendarId}
            onChange={e => setCalendarId(e.target.value)}
            className="bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none appearance-none cursor-pointer"
          >
            {calendars.filter(c => c.visible).map(c => (
              <option key={c.id} value={c.id}>{c.summary}</option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={addConferencing}
              onChange={e => setAddConferencing(e.target.checked)}
              className="sr-only"
            />
            <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] transition-colors ${
              addConferencing ? 'bg-accent-primary border-accent-primary text-white' : 'border-border-subtle'
            }`}>
              {addConferencing && '✓'}
            </span>
            <span className="text-xs text-text-secondary">Add conferencing</span>
          </label>

          <div className="flex-1" />

          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!parsed && !text.trim()}
            className="px-4 py-1.5 rounded-md text-xs font-medium text-white brand-gradient hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
