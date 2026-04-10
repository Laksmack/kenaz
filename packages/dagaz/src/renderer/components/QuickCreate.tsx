import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Calendar, CalendarEvent, CreateEventInput, UpdateEventInput, OverlayPerson, AttendeeInput, ReminderOverride } from '../../shared/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (data: CreateEventInput) => void;
  onUpdate?: (id: string, updates: UpdateEventInput) => void;
  editingEvent?: CalendarEvent | null;
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

function daySpanLabel(startStr: string, endStr: string): string {
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const s = new Date(sy, sm - 1, sd);
  const e = new Date(ey, em - 1, ed);
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  if (days <= 1) return '';
  return `${days} days`;
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return toDateStr(dt);
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

/** Parse freeform time input into HH:MM 24-hour format. Returns null if unparseable. */
function parseTimeInput(raw: string): string | null {
  const input = raw.trim().toLowerCase();
  if (!input) return null;

  if (input === 'noon' || input === '12p' || input === '12pm') return '12:00';
  if (input === 'midnight' || input === '12a' || input === '12am') return '00:00';

  const match = input.match(/^(\d{1,2})[:.]?(\d{2})?\s*(a\.?m\.?|p\.?m\.?|a|p)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.replace(/\./g, '').toLowerCase();

  if (minutes < 0 || minutes > 59) return null;

  if (period === 'pm' || period === 'p') {
    if (hours < 12) hours += 12;
  } else if (period === 'am' || period === 'a') {
    if (hours === 12) hours = 0;
  }

  if (hours < 0 || hours > 23) return null;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function formatTimeLabel(value: string): string {
  const [h, m] = value.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${suffix}`;
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(() => formatTimeLabel(value));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!focused) setText(formatTimeLabel(value));
  }, [value, focused]);

  const commit = () => {
    const parsed = parseTimeInput(text);
    if (parsed) {
      onChange(parsed);
      setText(formatTimeLabel(parsed));
    } else {
      setText(formatTimeLabel(value));
    }
  };

  return (
    <div className="relative w-[100px]">
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onFocus={() => { setFocused(true); setTimeout(() => inputRef.current?.select(), 0); }}
        onBlur={() => { setFocused(false); commit(); }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); inputRef.current?.blur(); } }}
        className="w-full bg-bg-primary border border-border-subtle rounded px-1.5 pr-5 py-0.5 text-xs text-text-primary outline-none focus:border-accent-primary/40"
        autoComplete="off"
      />
      <select
        ref={pickerRef}
        defaultValue=""
        onChange={e => {
          const picked = e.target.value;
          if (!picked) return;
          onChange(picked);
          setText(formatTimeLabel(picked));
          e.target.value = '';
        }}
        className="absolute top-0 right-0 h-full w-5 opacity-0 cursor-pointer"
        aria-label="Pick time"
      >
        <option value="">Pick time</option>
        {TIME_OPTIONS.map(t => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}

const RECURRENCE_PRESETS: Array<{ value: string; label: string; rrule: string | null }> = [
  { value: 'none', label: 'Does not repeat', rrule: null },
  { value: 'daily', label: 'Daily', rrule: 'RRULE:FREQ=DAILY' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { value: 'weekly', label: 'Weekly', rrule: 'RRULE:FREQ=WEEKLY' },
  { value: 'biweekly', label: 'Every 2 weeks', rrule: 'RRULE:FREQ=WEEKLY;INTERVAL=2' },
  { value: 'monthly', label: 'Monthly', rrule: 'RRULE:FREQ=MONTHLY' },
  { value: 'yearly', label: 'Yearly', rrule: 'RRULE:FREQ=YEARLY' },
];

function recurrenceRuleToPreset(rule: string): string {
  const r = rule.replace(/\n/g, '').trim().toUpperCase();
  for (const p of RECURRENCE_PRESETS) {
    if (p.rrule && r.includes(p.rrule.replace('RRULE:', ''))) return p.value;
  }
  return 'none';
}

export function QuickCreate({ open, onClose, onCreate, onUpdate, editingEvent, calendars, defaultCalendarId, defaultStart, defaultEnd, defaultAttendees }: Props) {
  const isEditing = !!editingEvent;
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [attendees, setAttendees] = useState<{ email: string; optional: boolean }[]>([]);
  const [attendeeInput, setAttendeeInput] = useState('');
  const [contactSuggestions, setContactSuggestions] = useState<Array<{ email: string; display_name: string | null; count: number }>>([]);
  const [suggestionIdx, setSuggestionIdx] = useState(-1);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [recurrence, setRecurrence] = useState('none');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [addConferencing, setAddConferencing] = useState(false);
  const [calendarId, setCalendarId] = useState('');
  const [reminder, setReminder] = useState('30');
  const [transparency, setTransparency] = useState<'opaque' | 'transparent'>('opaque');
  const [colorId, setColorId] = useState('');

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    if (editingEvent) {
      // Edit mode: pre-populate from existing event
      const ev = editingEvent;
      setTitle(ev.summary || '');
      setAllDay(!!ev.all_day);

      if (ev.all_day) {
        setDate(ev.start_date || toDateStr(new Date(ev.start_time)));
        // Google stores all-day end as exclusive, so subtract 1 day for display
        const endStr = ev.end_date || toDateStr(new Date(ev.end_time));
        const displayEnd = addDays(endStr, -1);
        setEndDate(displayEnd < (ev.start_date || '') ? (ev.start_date || endStr) : displayEnd);
        setStartTime('09:00');
        setEndTime('10:00');
      } else {
        const s = new Date(ev.start_time);
        const e = new Date(ev.end_time);
        setDate(toDateStr(s));
        setEndDate(toDateStr(s));
        setStartTime(toTimeStr(s));
        setEndTime(toTimeStr(e));
      }

      setLocation(ev.location || '');
      // Strip HTML tags from description for plain-text editing
      setDescription(ev.description ? ev.description.replace(/<[^>]*>/g, '') : '');
      setRecurrence(ev.recurrence_rule ? recurrenceRuleToPreset(ev.recurrence_rule) : 'none');
      setAddConferencing(!!ev.conference_data || !!ev.hangout_link);
      setAttendeeInput('');
      setAttendees(
        (ev.attendees || [])
          .filter(a => !a.is_self)
          .map(a => ({ email: a.email, optional: !!a.optional }))
      );
      setCalendarId(ev.calendar_id || defaultCalendarId || '');
      setReminder(ev.reminders && ev.reminders.length > 0 ? String(ev.reminders[0].minutes) : '30');
      setTransparency(ev.transparency === 'transparent' ? 'transparent' : 'opaque');
      setColorId(ev.color_id || '');
    } else {
      // Create mode: use defaults
      const start = defaultStart
        ? snap15(defaultStart)
        : (() => { const d = new Date(); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); return d; })();
      const end = defaultEnd ? snap15(defaultEnd) : new Date(start.getTime() + 60 * 60 * 1000);

      setTitle('');
      setDate(toDateStr(start));
      setEndDate(toDateStr(start));
      setStartTime(toTimeStr(start));
      setEndTime(toTimeStr(end));
      setAllDay(false);
      setLocation('');
      setDescription('');
      setRecurrence('none');
      setAddConferencing(false);
      setAttendeeInput('');
      setAttendees(defaultAttendees?.filter(p => p.visible).map(p => ({ email: p.email, optional: false })) || []);
      setCalendarId(defaultCalendarId || '');
      setReminder('30');
      setTransparency('opaque');
      setColorId('');
    }

    setTimeout(() => titleRef.current?.focus(), 50);
  }, [open, editingEvent, defaultStart, defaultEnd, defaultAttendees, defaultCalendarId]);

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

    const rruleEntry = RECURRENCE_PRESETS.find(p => p.value === recurrence);
    const recurrenceRules = rruleEntry?.rrule ? [rruleEntry.rrule] : undefined;

    const reminderOverrides: ReminderOverride[] | undefined = reminder !== 'none'
      ? [{ method: 'popup' as const, minutes: Number(reminder) }]
      : undefined;

    if (isEditing && editingEvent && onUpdate) {
      const updates: UpdateEventInput = {
        summary: title.trim(),
        start: allDay ? date : startD.toISOString(),
        end: allDay ? addDays(endDate, 1) : endD.toISOString(),
        all_day: allDay,
        attendees: attendees.length > 0 ? attendees.map(a => a.optional ? { email: a.email, optional: true } : a.email) : [],
        location: location || '',
        description: description || '',
        reminders: reminderOverrides,
        transparency,
        color_id: colorId || undefined,
        calendar_id: calendarId !== editingEvent.calendar_id ? calendarId : undefined,
      };
      onUpdate(editingEvent.id, updates);
      onClose();
    } else {
      const attendeeInputs: AttendeeInput[] | undefined = attendees.length > 0
        ? attendees.map(a => a.optional ? { email: a.email, optional: true } : a.email)
        : undefined;
      const data: CreateEventInput = {
        summary: title.trim(),
        start: allDay ? date : startD.toISOString(),
        end: allDay ? addDays(endDate, 1) : endD.toISOString(),
        all_day: allDay || undefined,
        attendees: attendeeInputs,
        location: location || undefined,
        description: description || undefined,
        calendar_id: calendarId || undefined,
        add_conferencing: addConferencing,
        recurrence: recurrenceRules,
        reminders: reminderOverrides,
        transparency: transparency !== 'opaque' ? transparency : undefined,
        color_id: colorId || undefined,
      };
      onCreate(data);
      onClose();
    }
  }, [title, buildDates, allDay, date, endDate, attendees, location, description, calendarId, addConferencing, recurrence, reminder, transparency, colorId, isEditing, editingEvent, onUpdate, onCreate, onClose]);

  const addAttendee = useCallback((raw: string) => {
    const email = raw.trim().toLowerCase();
    if (email && email.includes('@') && !attendees.some(a => a.email === email)) {
      setAttendees(prev => [...prev, { email, optional: false }]);
    }
    setAttendeeInput('');
    setContactSuggestions([]);
    setSuggestionIdx(-1);
  }, [attendees]);

  const removeAttendee = useCallback((email: string) => {
    setAttendees(prev => prev.filter(a => a.email !== email));
  }, []);

  const toggleOptional = useCallback((email: string) => {
    setAttendees(prev => prev.map(a => a.email === email ? { ...a, optional: !a.optional } : a));
  }, []);

  const searchAttendeeContacts = useCallback((q: string) => {
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    if (q.length < 2) { setContactSuggestions([]); setSuggestionIdx(-1); return; }
    suggestDebounceRef.current = setTimeout(async () => {
      try {
        const hits = await window.dagaz.searchContacts(q);
        const added = new Set(attendees.map(a => a.email));
        setContactSuggestions((hits || []).filter((r: any) => !added.has(r.email)));
        setSuggestionIdx(-1);
      } catch (e) { console.error('[QuickCreate] Contact search failed:', e); setContactSuggestions([]); }
    }, 150);
  }, [attendees]);

  const handleAttendeeInputChange = useCallback((val: string) => {
    setAttendeeInput(val);
    searchAttendeeContacts(val);
  }, [searchAttendeeContacts]);

  const handleAttendeeKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (contactSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIdx(prev => Math.min(prev + 1, contactSuggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIdx(prev => Math.max(prev - 1, -1));
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && suggestionIdx >= 0) {
        e.preventDefault();
        addAttendee(contactSuggestions[suggestionIdx].email);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setContactSuggestions([]);
        setSuggestionIdx(-1);
        return;
      }
    }
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      if (attendeeInput.trim()) addAttendee(attendeeInput);
    }
    if (e.key === 'Backspace' && !attendeeInput && attendees.length > 0) {
      removeAttendee(attendees[attendees.length - 1].email);
    }
  }, [attendeeInput, attendees, addAttendee, removeAttendee, contactSuggestions, suggestionIdx]);

  if (!open) return null;

  // Guard: useEffect hasn't initialized the form fields yet
  if (!date || !startTime || !endTime) return null;

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
          <span className="text-[10px] uppercase tracking-wider text-text-muted">{isEditing ? 'Edit Event' : 'New Event'}</span>
          <select
            value={calendarId}
            onChange={e => setCalendarId(e.target.value)}
            className="bg-bg-tertiary border border-border-subtle rounded-md px-2 py-0.5 text-[11px] text-text-secondary outline-none cursor-pointer hover:border-accent-primary/40 transition-colors"
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
              <div className="flex items-center gap-1.5 flex-wrap">
                <input
                  type="date"
                  value={date}
                  onChange={e => {
                    setDate(e.target.value);
                    if (e.target.value > endDate) setEndDate(e.target.value);
                  }}
                  className="bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary/40"
                />
                <span className="text-text-muted text-xs">→</span>
                <input
                  type="date"
                  value={endDate}
                  min={date}
                  onChange={e => setEndDate(e.target.value)}
                  className="bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary/40"
                />
                {daySpanLabel(date, endDate) && (
                  <span className="text-[10px] text-text-muted">{daySpanLabel(date, endDate)}</span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-text-primary font-medium">{friendlyDate(startD)}</span>
                <span className="text-text-muted text-[10px]">·</span>
                <TimeInput value={startTime} onChange={setStartTime} />
                <span className="text-text-muted text-xs">→</span>
                <TimeInput value={endTime} onChange={setEndTime} />
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

        {/* Recurrence */}
        {!isEditing && (
          <div className="px-4 py-2.5 border-t border-border-subtle">
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
              </svg>
              <select
                value={recurrence}
                onChange={e => setRecurrence(e.target.value)}
                className="flex-1 bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary/40 cursor-pointer"
              >
                {RECURRENCE_PRESETS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Participants */}
        <div className="px-4 py-2.5 border-t border-border-subtle">
          <div className="flex items-start gap-3">
            <svg className="w-4 h-4 text-text-muted flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <div className="flex-1 min-w-0 relative">
              <div className="flex flex-wrap items-center gap-1">
                {attendees.map(a => (
                  <span
                    key={a.email}
                    className={`inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-[11px] ${
                      a.optional
                        ? 'bg-bg-tertiary/50 border-border-subtle/50 text-text-muted italic'
                        : 'bg-bg-tertiary border-border-subtle text-text-secondary'
                    }`}
                  >
                    <button
                      onClick={() => toggleOptional(a.email)}
                      className="hover:text-text-primary transition-colors"
                      title={a.optional ? 'Click to mark as required' : 'Click to mark as optional'}
                    >{a.email}</button>
                    {a.optional && <span className="text-[9px] text-text-muted font-normal">opt</span>}
                    <button onClick={() => removeAttendee(a.email)} className="text-text-muted hover:text-text-primary text-xs leading-none ml-0.5">×</button>
                  </span>
                ))}
                <input
                  type="text"
                  value={attendeeInput}
                  onChange={e => handleAttendeeInputChange(e.target.value)}
                  onKeyDown={handleAttendeeKeyDown}
                  onBlur={() => { setTimeout(() => { setContactSuggestions([]); setSuggestionIdx(-1); }, 150); if (attendeeInput.trim()) addAttendee(attendeeInput); }}
                  placeholder={attendees.length ? 'Add another…' : 'Add participants'}
                  className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-xs text-text-primary placeholder-text-muted/50 py-0.5"
                  autoComplete="off"
                />
              </div>
              {contactSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-bg-secondary border border-border-subtle rounded-md shadow-lg z-50 overflow-hidden">
                  {contactSuggestions.map((c, i) => (
                    <button
                      key={c.email}
                      className={`w-full text-left px-3 py-1.5 text-xs flex flex-col gap-0 transition-colors ${
                        i === suggestionIdx ? 'bg-accent-primary/20 text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary'
                      }`}
                      onMouseDown={e => { e.preventDefault(); addAttendee(c.email); }}
                      onMouseEnter={() => setSuggestionIdx(i)}
                    >
                      {c.display_name && <span className="text-text-primary">{c.display_name}</span>}
                      <span className="text-text-muted text-[10px]">{c.email}</span>
                    </button>
                  ))}
                </div>
              )}
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

        {/* Reminder */}
        <div className="px-4 py-2.5 border-t border-border-subtle">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            <select
              value={reminder}
              onChange={e => setReminder(e.target.value)}
              className="flex-1 bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary/40 cursor-pointer"
            >
              <option value="none">No reminder</option>
              <option value="0">At time of event</option>
              <option value="5">5 minutes before</option>
              <option value="10">10 minutes before</option>
              <option value="15">15 minutes before</option>
              <option value="30">30 minutes before</option>
              <option value="60">1 hour before</option>
              <option value="1440">1 day before</option>
            </select>
          </div>
        </div>

        {/* Transparency + Color */}
        <div className="px-4 py-2.5 border-t border-border-subtle flex items-center gap-4">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setTransparency(v => v === 'opaque' ? 'transparent' : 'opaque')}
          >
            <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs text-text-secondary">{transparency === 'transparent' ? 'Free' : 'Busy'}</span>
            <span className={`w-8 h-[18px] rounded-full relative transition-colors ${
              transparency === 'opaque' ? 'bg-accent-primary' : 'bg-bg-tertiary border border-border-subtle'
            }`}>
              <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform ${
                transparency === 'opaque' ? 'translate-x-[16px]' : 'translate-x-[2px]'
              }`} />
            </span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[10px] text-text-muted mr-1">Color</span>
            {[
              { id: '', color: '' },
              { id: '1', color: '#7986CB' },
              { id: '2', color: '#33B679' },
              { id: '3', color: '#8E24AA' },
              { id: '4', color: '#E67C73' },
              { id: '5', color: '#F6BF26' },
              { id: '6', color: '#F4511E' },
              { id: '7', color: '#039BE5' },
              { id: '8', color: '#616161' },
              { id: '9', color: '#3F51B5' },
              { id: '10', color: '#0B8043' },
              { id: '11', color: '#D50000' },
            ].map(c => (
              <button
                key={c.id}
                onClick={() => setColorId(c.id)}
                className={`w-4 h-4 rounded-full transition-all ${
                  colorId === c.id ? 'ring-2 ring-accent-primary ring-offset-1 ring-offset-bg-secondary scale-110' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c.color || 'var(--bg-tertiary)' }}
                title={c.id ? `Color ${c.id}` : 'Default (calendar color)'}
              >
                {!c.id && <span className="block w-full h-full rounded-full border border-border-subtle" />}
              </button>
            ))}
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
            {isEditing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
