import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Calendar, CreateEventInput, OverlayPerson } from '../../shared/types';

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

function snap15(date: Date): Date {
  const d = new Date(date);
  d.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0);
  return d;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function toTimeStr(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function friendlyDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function durationLabel(startD: Date, endD: Date): string {
  const mins = Math.round((endD.getTime() - startD.getTime()) / 60000);
  if (mins <= 0) return '';
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function buildTimeOptions(): Array<{ value: string; label: string }> {
  const opts: Array<{ value: string; label: string }> = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      const suffix = h >= 12 ? 'PM' : 'AM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      opts.push({ value, label: `${h12}:${m.toString().padStart(2, '0')} ${suffix}` });
    }
  }
  return opts;
}

const TIME_OPTIONS = buildTimeOptions();

export function QuickCreate({ open, onClose, onCreate, calendars, defaultCalendarId, defaultStart, defaultEnd, defaultAttendees }: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [attendeeInput, setAttendeeInput] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [addConferencing, setAddConferencing] = useState(false);
  const [calendarId, setCalendarId] = useState('');

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const start = defaultStart
      ? snap15(defaultStart)
      : (() => { const d = new Date(); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); return d; })();
    const end = defaultEnd ? snap15(defaultEnd) : new Date(start.getTime() + 60 * 60 * 1000);

    setTitle('');
    setDate(toDateStr(start));
    setStartTime(toTimeStr(start));
    setEndTime(toTimeStr(end));
    setAllDay(false);
    setLocation('');
    setDescription('');
    setAddConferencing(false);
    setAttendeeInput('');
    setAttendees(defaultAttendees?.filter(p => p.visible).map(p => p.email) || []);
    setCalendarId(defaultCalendarId || '');

    setTimeout(() => titleRef.current?.focus(), 50);
  }, [open, defaultStart, defaultEnd, defaultAttendees, defaultCalendarId]);

  useEffect(() => {
    if (!calendarId && calendars.length > 0) {
      const primary = calendars.find(c => c.primary_calendar);
      setCalendarId(primary?.id || calendars[0].id);
    }
  }, [calendars, calendarId]);

  const buildDates = useCallback(() => {
    const [y, mo, d] = date.split('-').map(Number);
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startD = new Date(y, mo - 1, d, sh, sm);
    const endD = new Date(y, mo - 1, d, eh, em);
    if (endD <= startD) endD.setDate(endD.getDate() + 1);
    return { startD, endD };
  }, [date, startTime, endTime]);

  const handleSubmit = useCallback(() => {
    if (!title.trim()) return;
    const { startD, endD } = buildDates();

    const data: CreateEventInput = {
      summary: title.trim(),
      start: allDay ? date : startD.toISOString(),
      end: allDay ? date : endD.toISOString(),
      all_day: allDay || undefined,
      attendees: attendees.length > 0 ? attendees : undefined,
      location: location || undefined,
      description: description || undefined,
      calendar_id: calendarId || undefined,
      add_conferencing: addConferencing,
    };

    onCreate(data);
    onClose();
  }, [title, buildDates, allDay, date, attendees, location, description, calendarId, addConferencing, onCreate, onClose]);

  const addAttendee = useCallback((raw: string) => {
    const email = raw.trim().toLowerCase();
    if (email && email.includes('@') && !attendees.includes(email)) {
      setAttendees(prev => [...prev, email]);
    }
    setAttendeeInput('');
  }, [attendees]);

  const removeAttendee = useCallback((email: string) => {
    setAttendees(prev => prev.filter(e => e !== email));
  }, []);

  const handleAttendeeKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      if (attendeeInput.trim()) addAttendee(attendeeInput);
    }
    if (e.key === 'Backspace' && !attendeeInput && attendees.length > 0) {
      removeAttendee(attendees[attendees.length - 1]);
    }
  }, [attendeeInput, attendees, addAttendee, removeAttendee]);

  if (!open) return null;

  const { startD, endD } = buildDates();
  const dur = durationLabel(startD, endD);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-bg-secondary border border-border-subtle rounded-xl shadow-2xl w-[420px] animate-slide-up"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">New Event</span>
          <select
            value={calendarId}
            onChange={e => setCalendarId(e.target.value)}
            className="bg-transparent text-[10px] text-text-muted outline-none cursor-pointer"
          >
            {calendars.filter(c => c.visible).map(c => (
              <option key={c.id} value={c.id}>{c.summary}</option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div className="px-4 pb-3">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && title.trim()) handleSubmit(); }}
            placeholder="Event title"
            className="w-full bg-transparent border-none outline-none text-lg font-semibold text-text-primary placeholder-text-muted/50"
          />
        </div>

        {/* Time */}
        <div className="px-4 py-3 border-t border-border-subtle space-y-2">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {allDay ? (
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary/40"
              />
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-text-primary font-medium">{friendlyDate(startD)}</span>
                <span className="text-text-muted text-[10px]">·</span>
                <select
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="bg-bg-primary border border-border-subtle rounded px-1.5 py-0.5 text-xs text-text-primary outline-none focus:border-accent-primary/40 cursor-pointer"
                >
                  {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <span className="text-text-muted text-xs">→</span>
                <select
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="bg-bg-primary border border-border-subtle rounded px-1.5 py-0.5 text-xs text-text-primary outline-none focus:border-accent-primary/40 cursor-pointer"
                >
                  {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <span className="text-[10px] text-text-muted">{dur}</span>
              </div>
            )}
          </div>
          <div className="pl-7">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="sr-only" />
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[8px] transition-colors ${
                allDay ? 'bg-accent-primary border-accent-primary text-white' : 'border-border-subtle'
              }`}>{allDay && '✓'}</span>
              <span className="text-[11px] text-text-secondary">All-day</span>
            </label>
          </div>
        </div>

        {/* Participants */}
        <div className="px-4 py-2.5 border-t border-border-subtle">
          <div className="flex items-start gap-3">
            <svg className="w-4 h-4 text-text-muted flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1">
                {attendees.map(email => (
                  <span key={email} className="inline-flex items-center gap-1 bg-bg-tertiary border border-border-subtle rounded-full px-2 py-0.5 text-[11px] text-text-secondary">
                    {email}
                    <button onClick={() => removeAttendee(email)} className="text-text-muted hover:text-text-primary text-xs leading-none ml-0.5">×</button>
                  </span>
                ))}
                <input
                  type="email"
                  value={attendeeInput}
                  onChange={e => setAttendeeInput(e.target.value)}
                  onKeyDown={handleAttendeeKeyDown}
                  onBlur={() => { if (attendeeInput.trim()) addAttendee(attendeeInput); }}
                  placeholder={attendees.length ? 'Add another…' : 'Add participants'}
                  className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-xs text-text-primary placeholder-text-muted/50 py-0.5"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Conferencing */}
        <div
          className="px-4 py-2.5 border-t border-border-subtle flex items-center gap-3 cursor-pointer"
          onClick={() => setAddConferencing(v => !v)}
        >
          <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span className="flex-1 text-xs text-text-secondary">Conferencing</span>
          <span className={`w-8 h-[18px] rounded-full relative transition-colors ${
            addConferencing ? 'bg-accent-primary' : 'bg-bg-tertiary border border-border-subtle'
          }`}>
            <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform ${
              addConferencing ? 'translate-x-[16px]' : 'translate-x-[2px]'
            }`} />
          </span>
        </div>

        {/* Location */}
        <div className="px-4 py-2.5 border-t border-border-subtle">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Location"
              className="flex-1 bg-transparent border-none outline-none text-xs text-text-primary placeholder-text-muted/50"
            />
          </div>
        </div>

        {/* Description */}
        <div className="px-4 py-2.5 border-t border-border-subtle">
          <div className="flex items-start gap-3">
            <svg className="w-4 h-4 text-text-muted flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Description"
              rows={2}
              className="flex-1 bg-transparent border-none outline-none text-xs text-text-primary placeholder-text-muted/50 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border-subtle flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="px-5 py-1.5 rounded-md text-xs font-medium text-white brand-gradient hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
