import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import type { CalendarEvent, OverlayEvent, PendingInvite } from '../../shared/types';
import { EventBlock } from './EventBlock';
import { isSameDay, formatTime, dateKey, getUse24HourClock } from '../lib/utils';
import { useEventDrag, type DragMode } from '../hooks/useEventDrag';

interface Props {
  currentDate: Date;
  events: CalendarEvent[];
  overlayEvents?: OverlayEvent[];
  pendingInvites?: PendingInvite[];
  selectedEvent: CalendarEvent | null;
  onSelectEvent: (event: CalendarEvent) => void;
  onCreateEvent: (start: Date, end: Date) => void;
  onUpdateEvent?: (event: CalendarEvent, newStart: Date, newEnd: Date) => void;
  onRSVP?: (eventId: string, response: 'accepted' | 'declined' | 'tentative') => void;
  onDeleteEvent?: (eventId: string) => void;
  defaultEventDurationMinutes?: number;
}

const HOUR_HEIGHT = 60;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

type LayoutItem = { id: string; start_time: string; end_time: string; isOverlay: boolean };
type EventLayout = { column: number; totalColumns: number };

function getMins(start_time: string, end_time: string) {
  const s = new Date(start_time);
  const e = new Date(end_time);
  const start = s.getHours() * 60 + s.getMinutes();
  let end = e.getHours() * 60 + e.getMinutes();
  if (end <= start && e.getTime() > s.getTime()) end = 24 * 60;
  return { start, end: Math.max(end, start + 15) };
}

function computeLayouts(items: LayoutItem[]): Map<string, EventLayout> {
  const layouts = new Map<string, EventLayout>();
  if (items.length === 0) return layouts;

  const sorted = [...items].sort((a, b) => {
    const am = getMins(a.start_time, a.end_time);
    const bm = getMins(b.start_time, b.end_time);
    return am.start !== bm.start ? am.start - bm.start : (bm.end - bm.start) - (am.end - am.start);
  });

  // Transitive overlap groups
  const groups: LayoutItem[][] = [];
  let grp: LayoutItem[] = [], grpEnd = 0;
  for (const it of sorted) {
    const m = getMins(it.start_time, it.end_time);
    if (grp.length === 0 || m.start < grpEnd) { grp.push(it); grpEnd = Math.max(grpEnd, m.end); }
    else { groups.push(grp); grp = [it]; grpEnd = m.end; }
  }
  if (grp.length > 0) groups.push(grp);

  for (const g of groups) {
    if (g.length === 1) { layouts.set(g[0].id, { column: 0, totalColumns: 1 }); continue; }

    const colEnds: number[] = [];
    for (const it of g) {
      const m = getMins(it.start_time, it.end_time);
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (m.start >= colEnds[c]) { colEnds[c] = m.end; layouts.set(it.id, { column: c, totalColumns: 0 }); placed = true; break; }
      }
      if (!placed) { layouts.set(it.id, { column: colEnds.length, totalColumns: 0 }); colEnds.push(m.end); }
    }
    const tc = colEnds.length;
    for (const it of g) { const l = layouts.get(it.id); if (l) l.totalColumns = tc; }
  }
  return layouts;
}

function overlayToEvent(oe: OverlayEvent): CalendarEvent {
  return {
    id: `overlay-${oe.personEmail}::${oe.id}`,
    google_id: null, calendar_id: oe.personEmail,
    summary: oe.summary, description: '', location: '',
    start_time: oe.start_time, end_time: oe.end_time,
    start_date: oe.start_date ?? null, end_date: oe.end_date ?? null,
    all_day: oe.all_day, time_zone: null,
    status: oe.status as 'confirmed' | 'tentative' | 'cancelled',
    self_response: null, organizer_email: oe.personEmail, organizer_name: null,
    is_organizer: false, recurrence_rule: null, recurring_event_id: null,
    html_link: null, hangout_link: null, conference_data: null,
    transparency: 'opaque', visibility: 'default', color_id: null,
    reminders: null, etag: null, local_only: true,
    pending_action: null, pending_payload: null,
    created_at: '', updated_at: '',
    calendar_color: oe.personColor,
  };
}

function timeOverlaps(s1: string, e1: string, s2: string, e2: string): boolean {
  return new Date(s1).getTime() < new Date(e2).getTime() && new Date(s2).getTime() < new Date(e1).getTime();
}

export function DayView({ currentDate, events, overlayEvents = [], pendingInvites = [], selectedEvent, onSelectEvent, onCreateEvent, onUpdateEvent, onRSVP, onDeleteEvent, defaultEventDurationMinutes = 60 }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => new Date(), []);
  const isToday = isSameDay(currentDate, today);

  // Drag-to-move / resize
  const handleDragEnd = useCallback((event: CalendarEvent, newStart: Date, newEnd: Date, _dayIndex: number) => {
    if (!onUpdateEvent) return;
    const finalStart = new Date(currentDate);
    finalStart.setHours(newStart.getHours(), newStart.getMinutes(), 0, 0);
    const finalEnd = new Date(currentDate);
    finalEnd.setHours(newEnd.getHours(), newEnd.getMinutes(), 0, 0);
    onUpdateEvent(event, finalStart, finalEnd);
  }, [onUpdateEvent, currentDate]);

  const { dragState, isDragging, startDrag, getGhostStyle, getGhostLabel } = useEventDrag(handleDragEnd);

  const handleEventDragStart = useCallback((event: CalendarEvent, mode: DragMode, mouseY: number) => {
    if (!scrollRef.current) return;
    startDrag(event, mode, mouseY, 0, scrollRef.current, '[data-day-column]');
  }, [startDrag]);

  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      scrollRef.current.scrollTop = Math.max(0, (now.getHours() - 1) * HOUR_HEIGHT);
    }
  }, []);

  const { allDayEvents, timedEvents } = useMemo(() => {
    const key = dateKey(currentDate);
    const allDay: CalendarEvent[] = [];
    const timed: CalendarEvent[] = [];
    for (const event of events) {
      if (event.all_day) allDay.push(event);
      else if (dateKey(new Date(event.start_time)) === key) timed.push(event);
    }
    return { allDayEvents: allDay, timedEvents: timed };
  }, [events, currentDate]);

  const dayOverlay = useMemo(() => {
    const key = dateKey(currentDate);
    return overlayEvents.filter(oe => !oe.all_day && dateKey(new Date(oe.start_time)) === key);
  }, [overlayEvents, currentDate]);

  const dayPendingInvites = useMemo(() => {
    const key = dateKey(currentDate);
    return pendingInvites.filter(inv =>
      inv.startTime && inv.endTime && dateKey(new Date(inv.startTime)) === key
    );
  }, [pendingInvites, currentDate]);

  const conflictingEventIds = useMemo(() => {
    const ids = new Set<string>();
    for (const inv of dayPendingInvites) {
      if (!inv.startTime || !inv.endTime) continue;
      for (const ev of timedEvents) {
        if (timeOverlaps(inv.startTime, inv.endTime, ev.start_time, ev.end_time)) {
          ids.add(ev.id);
        }
      }
    }
    return ids;
  }, [dayPendingInvites, timedEvents]);

  // Unified layout: user + overlay events together
  const allLayouts = useMemo(() => {
    const userItems: LayoutItem[] = timedEvents.map(e => ({ id: e.id, start_time: e.start_time, end_time: e.end_time, isOverlay: false }));
    const overlayItems: LayoutItem[] = dayOverlay.map(oe => ({ id: `overlay-${oe.personEmail}::${oe.id}`, start_time: oe.start_time, end_time: oe.end_time, isOverlay: true }));
    return computeLayouts([...userItems, ...overlayItems]);
  }, [timedEvents, dayOverlay]);

  const getStyle = useCallback((id: string, start_time: string, end_time: string): React.CSSProperties => {
    const start = new Date(start_time);
    const end = new Date(end_time);
    const startMins = start.getHours() * 60 + start.getMinutes();
    let endMins = end.getHours() * 60 + end.getMinutes();
    if (endMins <= startMins && end.getTime() > start.getTime()) endMins = 24 * 60;
    const dur = Math.max(endMins - startMins, 15);

    const layout = allLayouts.get(id);
    const col = layout?.column ?? 0;
    const totalCols = layout?.totalColumns ?? 1;

    const top = `${(startMins / 60) * HOUR_HEIGHT}px`;
    const height = `${Math.max((dur / 60) * HOUR_HEIGHT - 2, 18)}px`;

    const cw = 100 / totalCols;
    const left = col * cw;

    return {
      position: 'absolute', top, height,
      left: `calc(${left}% + 1px)`, width: `calc(${cw}% - 3px)`,
      zIndex: 11 + col, overflow: 'hidden',
    };
  }, [allLayouts]);

  // Live-updating "now" indicator — recalculates every 60 seconds
  const [nowPosition, setNowPosition] = useState<number | null>(null);

  useEffect(() => {
    const update = () => {
      if (!isToday) { setNowPosition(null); return; }
      const now = new Date();
      setNowPosition((now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT);
    };
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [isToday]);

  const getInviteStyle = useCallback((startTime: string, endTime: string): React.CSSProperties => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const startMins = start.getHours() * 60 + start.getMinutes();
    let endMins = end.getHours() * 60 + end.getMinutes();
    if (endMins <= startMins && end.getTime() > start.getTime()) endMins = 24 * 60;
    const dur = Math.max(endMins - startMins, 15);
    return {
      position: 'absolute',
      top: `${(startMins / 60) * HOUR_HEIGHT}px`,
      height: `${Math.max((dur / 60) * HOUR_HEIGHT - 2, 18)}px`,
      left: '2px', right: '2px',
      zIndex: 8,
      pointerEvents: 'none',
    };
  }, []);

  const handleTimeSlotClick = useCallback((e: React.MouseEvent) => {
    if (isDragging) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const scrollRect = scrollEl.getBoundingClientRect();
    const y = e.clientY - scrollRect.top + scrollEl.scrollTop;
    const hour = Math.floor(y / HOUR_HEIGHT);
    const minutes = Math.round(((y % HOUR_HEIGHT) / HOUR_HEIGHT) * 60 / 15) * 15;
    const start = new Date(currentDate);
    start.setHours(hour, minutes, 0, 0);
    const end = new Date(start.getTime() + defaultEventDurationMinutes * 60 * 1000);
    onCreateEvent(start, end);
  }, [currentDate, onCreateEvent, isDragging, defaultEventDurationMinutes]);

  const dateLabel = currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border-subtle px-4 py-3 flex-shrink-0">
        <h2 className={`text-sm font-medium ${isToday ? 'text-accent-primary' : 'text-text-primary'}`}>
          {isToday ? 'Today' : ''} {dateLabel}
        </h2>
        {allDayEvents.length > 0 && (
          <div className="mt-2 space-y-1">
            {allDayEvents.map(event => (
              <EventBlock key={event.id} event={event} selected={selectedEvent?.id === event.id} onClick={onSelectEvent} onDelete={onDeleteEvent} compact />
            ))}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="flex" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
          <div className="w-16 flex-shrink-0 relative">
            {HOURS.map(hour => (
              <div key={hour} className="absolute right-3 text-[11px] text-text-muted" style={{ top: `${hour * HOUR_HEIGHT - 7}px` }}>
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </div>
            ))}
          </div>

          <div
            data-day-column
            className={`flex-1 relative border-l border-border-subtle ${isToday ? 'bg-accent-primary/[0.02]' : ''}`}
            onClick={handleTimeSlotClick}
          >
            {HOURS.map(hour => (
              <div key={hour} className="hour-slot absolute left-0 right-0" style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }} />
            ))}
            {nowPosition !== null && <div className="now-indicator" style={{ top: `${nowPosition}px` }} />}

            {/* Overlay events — with column layout */}
            {dayOverlay.map(oe => {
              const lid = `overlay-${oe.personEmail}::${oe.id}`;
              return (
                <div
                  key={lid}
                  style={getStyle(lid, oe.start_time, oe.end_time)}
                  title={`${oe.personEmail}: ${oe.summary}`}
                  onClick={(e) => { e.stopPropagation(); onSelectEvent(overlayToEvent(oe)); }}
                >
                  <div
                    className="h-full rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-tight overflow-hidden border cursor-pointer hover:brightness-125 transition-all"
                    style={{ backgroundColor: oe.personColor + '25', borderColor: oe.personColor + '60', color: oe.personColor }}
                  >
                    <div className="truncate">{oe.summary}</div>
                    <div className="truncate opacity-70">{formatTime(oe.start_time)}</div>
                  </div>
                </div>
              );
            })}

            {/* Pending invite ghost blocks */}
            {dayPendingInvites.map(inv => {
              if (!inv.startTime || !inv.endTime) return null;
              const hasConflict = timedEvents.some(ev =>
                timeOverlaps(inv.startTime!, inv.endTime!, ev.start_time, ev.end_time)
              );
              return (
                <div key={`invite-${inv.threadId}`} style={getInviteStyle(inv.startTime, inv.endTime)}>
                  <div
                    className="h-full rounded-md px-1.5 py-0.5 text-[10px] leading-tight overflow-hidden"
                    style={{
                      backgroundColor: 'var(--accent-primary-rgb, 74 154 194 / 0.15)',
                      border: '1.5px dashed var(--accent-primary, #4A9AC2)',
                      opacity: 0.55,
                    }}
                  >
                    <div className="flex items-center gap-1 truncate text-text-muted font-medium">
                      <span>📨</span>
                      <span className="truncate">{inv.title}</span>
                      {hasConflict && <span className="flex-shrink-0">⚠️</span>}
                    </div>
                    <div className="truncate text-text-muted opacity-70">{formatTime(inv.startTime)}</div>
                  </div>
                  {hasConflict && (
                    <div
                      className="absolute inset-0 rounded-md pointer-events-none"
                      style={{ backgroundColor: 'rgba(245, 158, 11, 0.06)' }}
                    />
                  )}
                </div>
              );
            })}

            {/* User events */}
            {timedEvents.map(event => (
              <div
                key={event.id}
                style={{
                  ...getStyle(event.id, event.start_time, event.end_time),
                  ...(isDragging && dragState?.event.id === event.id ? { opacity: 0.35 } : {}),
                }}
              >
                <EventBlock
                  event={event}
                  selected={selectedEvent?.id === event.id}
                  onClick={onSelectEvent}
                  onRSVP={onRSVP}
                  onDelete={onDeleteEvent}
                  onDragStart={onUpdateEvent ? (ev, mode, mouseY) => handleEventDragStart(ev, mode, mouseY) : undefined}
                />
                {conflictingEventIds.has(event.id) && (
                  <div
                    className="absolute top-1 right-1 w-3 h-3 rounded-full bg-amber-500/80 flex items-center justify-center text-[7px] text-white font-bold"
                    title="Conflicts with a pending invite"
                  >!</div>
                )}
              </div>
            ))}

            {/* Drag ghost */}
            {dragState && (() => {
              const ghostStyle = getGhostStyle(HOUR_HEIGHT);
              return ghostStyle ? (
                <div style={ghostStyle} className="drag-ghost flex items-start px-2 py-1">
                  <span className="text-[10px] font-medium text-accent-primary">
                    {dragState.event.summary}
                  </span>
                  <span className="text-[9px] text-text-muted ml-auto whitespace-nowrap">
                    {getGhostLabel(getUse24HourClock())}
                  </span>
                </div>
              ) : null;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
