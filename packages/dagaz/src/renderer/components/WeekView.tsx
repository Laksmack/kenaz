import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import type { CalendarEvent, OverlayEvent, PendingInvite } from '../../shared/types';
import { EventBlock } from './EventBlock';
import { getWeekDates, isSameDay, formatTime, dateKey, getUse24HourClock } from '../lib/utils';
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
  weekDays: 5 | 7;
  defaultEventDurationMinutes?: number;
}

function timeOverlaps(s1: string, e1: string, s2: string, e2: string): boolean {
  return new Date(s1).getTime() < new Date(e2).getTime() && new Date(s2).getTime() < new Date(e1).getTime();
}

const HOUR_HEIGHT = 60;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Unified item for layout: either a user event or an overlay event
type LayoutItem = {
  id: string;
  start_time: string;
  end_time: string;
  isOverlay: boolean;
  source: CalendarEvent | OverlayEvent;
};

type EventLayout = {
  column: number;
  totalColumns: number;
};

function getMinutesFromTime(start_time: string, end_time: string) {
  const s = new Date(start_time);
  const e = new Date(end_time);
  const start = s.getHours() * 60 + s.getMinutes();
  let end = e.getHours() * 60 + e.getMinutes();
  // Handle events that cross midnight or end at midnight next day
  if (end <= start && e.getTime() > s.getTime()) end = 24 * 60;
  return { start, end: Math.max(end, start + 15) };
}

/**
 * Assign side-by-side columns to overlapping events.
 * Uses a single-pass greedy algorithm (same approach as Google Calendar):
 * 1. Sort by start time, longest first for ties
 * 2. Group into transitive overlap clusters
 * 3. Greedily assign columns within each cluster
 * 4. All events in a cluster share the same totalColumns
 */
function computeLayouts(items: LayoutItem[]): Map<string, EventLayout> {
  const layouts = new Map<string, EventLayout>();
  if (items.length === 0) return layouts;

  const sorted = [...items].sort((a, b) => {
    const am = getMinutesFromTime(a.start_time, a.end_time);
    const bm = getMinutesFromTime(b.start_time, b.end_time);
    if (am.start !== bm.start) return am.start - bm.start;
    return (bm.end - bm.start) - (am.end - am.start);
  });

  // Build transitive overlap groups
  const groups: LayoutItem[][] = [];
  let group: LayoutItem[] = [];
  let groupEnd = 0;

  for (const item of sorted) {
    const m = getMinutesFromTime(item.start_time, item.end_time);
    if (group.length === 0 || m.start < groupEnd) {
      group.push(item);
      groupEnd = Math.max(groupEnd, m.end);
    } else {
      groups.push(group);
      group = [item];
      groupEnd = m.end;
    }
  }
  if (group.length > 0) groups.push(group);

  for (const grp of groups) {
    if (grp.length === 1) {
      layouts.set(grp[0].id, { column: 0, totalColumns: 1 });
      continue;
    }

    // Greedy column assignment
    const colEnds: number[] = [];
    for (const item of grp) {
      const m = getMinutesFromTime(item.start_time, item.end_time);
      let placed = false;
      for (let col = 0; col < colEnds.length; col++) {
        if (m.start >= colEnds[col]) {
          colEnds[col] = m.end;
          layouts.set(item.id, { column: col, totalColumns: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        layouts.set(item.id, { column: colEnds.length, totalColumns: 0 });
        colEnds.push(m.end);
      }
    }

    const totalCols = colEnds.length;
    for (const item of grp) {
      const l = layouts.get(item.id);
      if (l) l.totalColumns = totalCols;
    }
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

export function WeekView({ currentDate, events, overlayEvents = [], pendingInvites = [], selectedEvent, onSelectEvent, onCreateEvent, onUpdateEvent, onRSVP, onDeleteEvent, weekDays, defaultEventDurationMinutes = 60 }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => new Date(), []);
  const weekDates = useMemo(() => getWeekDates(currentDate, weekDays), [currentDate, weekDays]);

  // Drag-to-move / resize
  const handleDragEnd = useCallback((event: CalendarEvent, newStart: Date, newEnd: Date, dayIndex: number) => {
    if (!onUpdateEvent) return;
    const targetDay = weekDates[dayIndex];
    if (!targetDay) return;
    const finalStart = new Date(targetDay);
    finalStart.setHours(newStart.getHours(), newStart.getMinutes(), 0, 0);
    const finalEnd = new Date(targetDay);
    finalEnd.setHours(newEnd.getHours(), newEnd.getMinutes(), 0, 0);
    onUpdateEvent(event, finalStart, finalEnd);
  }, [onUpdateEvent, weekDates]);

  const { dragState, isDragging, startDrag, getGhostStyle, getGhostLabel } = useEventDrag(handleDragEnd);

  const handleEventDragStart = useCallback((event: CalendarEvent, mode: DragMode, mouseY: number, dayIndex: number) => {
    if (!scrollRef.current) return;
    startDrag(event, mode, mouseY, dayIndex, scrollRef.current, '[data-day-column]');
  }, [startDrag]);

  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const scrollTo = Math.max(0, (now.getHours() - 1) * HOUR_HEIGHT);
      scrollRef.current.scrollTop = scrollTo;
    }
  }, []);

  // Group user events by day
  const eventsByDay = useMemo(() => {
    const map = new Map<string, { allDay: CalendarEvent[]; timed: CalendarEvent[] }>();
    for (const d of weekDates) {
      map.set(dateKey(d), { allDay: [], timed: [] });
    }
    for (const event of events) {
      if (event.all_day) {
        const start = new Date(event.start_date || event.start_time);
        const end = new Date(event.end_date || event.end_time);
        for (const d of weekDates) {
          if (d >= start && d < end) map.get(dateKey(d))?.allDay.push(event);
        }
      } else {
        const key = dateKey(new Date(event.start_time));
        if (map.has(key)) map.get(key)!.timed.push(event);
      }
    }
    return map;
  }, [events, weekDates]);

  // Group overlay events by day
  const overlayByDay = useMemo(() => {
    const map = new Map<string, OverlayEvent[]>();
    for (const d of weekDates) map.set(dateKey(d), []);
    for (const oe of overlayEvents) {
      if (oe.all_day) continue;
      const key = dateKey(new Date(oe.start_time));
      if (map.has(key)) map.get(key)!.push(oe);
    }
    return map;
  }, [overlayEvents, weekDates]);

  // Group pending invites by day
  const invitesByDay = useMemo(() => {
    const map = new Map<string, PendingInvite[]>();
    for (const d of weekDates) map.set(dateKey(d), []);
    for (const inv of pendingInvites) {
      if (!inv.startTime || !inv.endTime) continue;
      const key = dateKey(new Date(inv.startTime));
      if (map.has(key)) map.get(key)!.push(inv);
    }
    return map;
  }, [pendingInvites, weekDates]);

  // Conflict detection: which confirmed event IDs overlap with pending invites
  const conflictingEventIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [key, dayData] of eventsByDay.entries()) {
      const dayInvites = invitesByDay.get(key) || [];
      for (const inv of dayInvites) {
        if (!inv.startTime || !inv.endTime) continue;
        for (const ev of dayData.timed) {
          if (timeOverlaps(inv.startTime, inv.endTime, ev.start_time, ev.end_time)) {
            ids.add(ev.id);
          }
        }
      }
    }
    return ids;
  }, [eventsByDay, invitesByDay]);

  // Unified layout: user events + overlay events in same column algorithm
  const layoutsByDay = useMemo(() => {
    const result = new Map<string, Map<string, EventLayout>>();

    for (const [key, dayData] of eventsByDay.entries()) {
      const userItems: LayoutItem[] = dayData.timed.map(e => ({
        id: e.id, start_time: e.start_time, end_time: e.end_time,
        isOverlay: false, source: e,
      }));
      const overlayItems: LayoutItem[] = (overlayByDay.get(key) || []).map(oe => ({
        id: `overlay-${oe.personEmail}::${oe.id}`, start_time: oe.start_time, end_time: oe.end_time,
        isOverlay: true, source: oe,
      }));

      const allItems = [...userItems, ...overlayItems];
      result.set(key, computeLayouts(allItems));
    }

    return result;
  }, [eventsByDay, overlayByDay]);

  const getItemStyle = useCallback((id: string, start_time: string, end_time: string, dayKey: string): React.CSSProperties => {
    const start = new Date(start_time);
    const end = new Date(end_time);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    let endMinutes = end.getHours() * 60 + end.getMinutes();
    if (endMinutes <= startMinutes && end.getTime() > start.getTime()) endMinutes = 24 * 60;
    const duration = Math.max(endMinutes - startMinutes, 15);

    const layout = layoutsByDay.get(dayKey)?.get(id);
    const column = layout?.column ?? 0;
    const totalColumns = layout?.totalColumns ?? 1;

    const top = `${(startMinutes / 60) * HOUR_HEIGHT}px`;
    const height = `${Math.max((duration / 60) * HOUR_HEIGHT - 2, 18)}px`;

    const colWidth = 100 / totalColumns;
    const leftPercent = column * colWidth;

    return {
      position: 'absolute', top, height,
      left: `calc(${leftPercent}% + 1px)`,
      width: `calc(${colWidth}% - 3px)`,
      zIndex: 11 + column, overflow: 'hidden',
    };
  }, [layoutsByDay]);

  // Live-updating "now" indicator — recalculates every 60 seconds
  const [nowPosition, setNowPosition] = useState<{ top: number; dayIndex: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const dayIndex = weekDates.findIndex(d => isSameDay(d, now));
      if (dayIndex === -1) { setNowPosition(null); return; }
      const minutes = now.getHours() * 60 + now.getMinutes();
      setNowPosition({ top: (minutes / 60) * HOUR_HEIGHT, dayIndex });
    };
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [weekDates]);

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

  const handleTimeSlotClick = useCallback((dayDate: Date, e: React.MouseEvent) => {
    if (isDragging) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const scrollRect = scrollEl.getBoundingClientRect();
    const y = e.clientY - scrollRect.top + scrollEl.scrollTop;
    const hour = Math.floor(y / HOUR_HEIGHT);
    const minutes = Math.round(((y % HOUR_HEIGHT) / HOUR_HEIGHT) * 60 / 15) * 15;
    const start = new Date(dayDate);
    start.setHours(hour, minutes, 0, 0);
    const end = new Date(start.getTime() + defaultEventDurationMinutes * 60 * 1000);
    onCreateEvent(start, end);
  }, [onCreateEvent, isDragging, defaultEventDurationMinutes]);

  return (
    <div className="flex flex-col h-full">
      {/* Header: day columns */}
      <div className="flex border-b border-border-subtle flex-shrink-0">
        <div className="w-14 flex-shrink-0" />
        {weekDates.map((d, i) => {
          const isToday = isSameDay(d, today);
          const allDayEvents = eventsByDay.get(dateKey(d))?.allDay || [];
          return (
            <div key={i} className="flex-1 min-w-0 border-l border-border-subtle">
              <div className={`text-center py-2 ${isToday ? 'bg-accent-primary/5' : ''}`}>
                <div className="text-[10px] uppercase tracking-wider text-text-muted">
                  {d.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className={`text-lg font-light ${isToday ? 'text-accent-primary font-medium' : 'text-text-primary'}`}>
                  {d.getDate()}
                </div>
              </div>
              {allDayEvents.length > 0 && (
                <div className="px-1 pb-1 space-y-0.5">
                  {allDayEvents.slice(0, 3).map(event => (
                    <EventBlock key={event.id} event={event} selected={selectedEvent?.id === event.id} onClick={onSelectEvent} onDelete={onDeleteEvent} compact />
                  ))}
                  {allDayEvents.length > 3 && (
                    <div className="text-[10px] text-text-muted px-1">+{allDayEvents.length - 3} more</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Timeline body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin relative">
        <div className="flex" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
          {/* Time gutter */}
          <div className="w-14 flex-shrink-0 relative">
            {HOURS.map(hour => (
              <div key={hour} className="absolute right-2 text-[10px] text-text-muted" style={{ top: `${hour * HOUR_HEIGHT - 6}px` }}>
                {hour === 0 ? '' : getUse24HourClock() ? `${String(hour).padStart(2, '0')}:00` : `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDates.map((d, dayIdx) => {
            const key = dateKey(d);
            const timedEvents = eventsByDay.get(key)?.timed || [];
            const dayOverlay = overlayByDay.get(key) || [];
            const isToday = isSameDay(d, today);
            const ghostStyle = dragState?.dayIndex === dayIdx ? getGhostStyle(HOUR_HEIGHT) : null;

            return (
              <div
                key={dayIdx}
                data-day-column
                className={`flex-1 min-w-0 relative border-l border-border-subtle ${isToday ? 'bg-accent-primary/[0.02]' : ''}`}
                onClick={(e) => handleTimeSlotClick(d, e)}
              >
                {HOURS.map(hour => (
                  <div key={hour} className="hour-slot absolute left-0 right-0" style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }} />
                ))}

                {nowPosition && nowPosition.dayIndex === dayIdx && (
                  <div className="now-indicator" style={{ top: `${nowPosition.top}px` }} />
                )}

                {/* Overlay events — rendered with column layout */}
                {dayOverlay.map(oe => {
                  const layoutId = `overlay-${oe.personEmail}::${oe.id}`;
                  return (
                    <div
                      key={layoutId}
                      style={getItemStyle(layoutId, oe.start_time, oe.end_time, key)}
                      title={`${oe.personEmail}: ${oe.summary}`}
                      onClick={(e) => { e.stopPropagation(); onSelectEvent(overlayToEvent(oe)); }}
                    >
                      <div
                        className="h-full rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-tight overflow-hidden border cursor-pointer hover:brightness-125 transition-all"
                        style={{
                          backgroundColor: oe.personColor + '25',
                          borderColor: oe.personColor + '60',
                          color: oe.personColor,
                        }}
                      >
                        <div className="truncate">{oe.summary}</div>
                        <div className="truncate opacity-70">{formatTime(oe.start_time)}</div>
                      </div>
                    </div>
                  );
                })}

                {/* Pending invite ghost blocks */}
                {(invitesByDay.get(key) || []).map(inv => {
                  if (!inv.startTime || !inv.endTime) return null;
                  const hasConflict = timedEvents.some(ev =>
                    timeOverlaps(inv.startTime!, inv.endTime!, ev.start_time, ev.end_time)
                  );
                  return (
                    <div key={`invite-${inv.threadId}`} style={getInviteStyle(inv.startTime, inv.endTime)}>
                      <div
                        className="h-full rounded-md px-1 py-0.5 text-[9px] leading-tight overflow-hidden"
                        style={{
                          backgroundColor: 'var(--accent-primary-rgb, 74 154 194 / 0.15)',
                          border: '1.5px dashed var(--accent-primary, #4A9AC2)',
                          opacity: 0.55,
                        }}
                      >
                        <div className="flex items-center gap-0.5 truncate text-text-muted font-medium">
                          <span>📨</span>
                          <span className="truncate">{inv.title}</span>
                          {hasConflict && <span className="flex-shrink-0">⚠️</span>}
                        </div>
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
                      ...getItemStyle(event.id, event.start_time, event.end_time, key),
                      ...(isDragging && dragState?.event.id === event.id ? { opacity: 0.35 } : {}),
                    }}
                  >
                    <EventBlock
                      event={event}
                      selected={selectedEvent?.id === event.id}
                      onClick={onSelectEvent}
                      onRSVP={onRSVP}
                      onDelete={onDeleteEvent}
                      onDragStart={onUpdateEvent ? (ev, mode, mouseY) => handleEventDragStart(ev, mode, mouseY, dayIdx) : undefined}
                    />
                    {conflictingEventIds.has(event.id) && (
                      <div
                        className="absolute top-1 right-1 w-3 h-3 rounded-full bg-amber-500/80 flex items-center justify-center text-[7px] text-white font-bold z-20"
                        title="Conflicts with a pending invite"
                      >!</div>
                    )}
                  </div>
                ))}

                {/* Drag ghost */}
                {ghostStyle && dragState && (
                  <div style={ghostStyle} className="drag-ghost flex items-start px-2 py-1">
                    <span className="text-[10px] font-medium text-accent-primary">
                      {dragState.event.summary}
                    </span>
                    <span className="text-[9px] text-text-muted ml-auto whitespace-nowrap">
                      {getGhostLabel(getUse24HourClock())}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
