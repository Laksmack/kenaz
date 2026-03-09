import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import type { CalendarEvent, OverlayEvent, PendingInvite } from '../../shared/types';
import { EventBlock } from './EventBlock';
import { isSameDay, formatTime, dateKey, getUse24HourClock } from '../lib/utils';
import { useEventDrag, type DragMode } from '../hooks/useEventDrag';
import { useNowIndicator } from '../hooks/useNowIndicator';
import {
  HOUR_HEIGHT, HOURS, getMinutesFromTime, timeOverlaps,
  computeLayouts, overlayToEvent, inviteMatchesEvent, isExcludedFromConflicts,
  type LayoutItem,
} from '../lib/event-layout';

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
        if (isExcludedFromConflicts(ev)) continue;
        // Don't flag the event that this invite IS (same meeting, updated)
        if (inviteMatchesEvent(inv, ev)) continue;
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

  const nowPosition = useNowIndicator(isToday);

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
                {hour === 0 ? '' : getUse24HourClock() ? `${String(hour).padStart(2, '0')}:00` : `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`}
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
                !isExcludedFromConflicts(ev) &&
                !inviteMatchesEvent(inv, ev) &&
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
