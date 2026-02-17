import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import type { CalendarEvent, OverlayEvent } from '../../shared/types';
import { EventBlock } from './EventBlock';
import { isSameDay, formatTime, dateKey } from '../lib/utils';

interface Props {
  currentDate: Date;
  events: CalendarEvent[];
  overlayEvents?: OverlayEvent[];
  selectedEvent: CalendarEvent | null;
  onSelectEvent: (event: CalendarEvent) => void;
  onCreateEvent: (start: Date, end: Date) => void;
  onRSVP?: (eventId: string, response: 'accepted' | 'declined' | 'tentative') => void;
}

const HOUR_HEIGHT = 60;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Unified layout item
type LayoutItem = { id: string; start_time: string; end_time: string; isOverlay: boolean };
type EventLayout = { isBackground: boolean; column: number; totalColumns: number };

function getMins(start_time: string, end_time: string) {
  const s = new Date(start_time);
  const e = new Date(end_time);
  return { start: s.getHours() * 60 + s.getMinutes(), end: Math.max(e.getHours() * 60 + e.getMinutes(), s.getHours() * 60 + s.getMinutes() + 15) };
}

function overlap(a: LayoutItem, b: LayoutItem) {
  const am = getMins(a.start_time, a.end_time);
  const bm = getMins(b.start_time, b.end_time);
  return am.start < bm.end && am.end > bm.start;
}

function computeLayouts(items: LayoutItem[]): Map<string, EventLayout> {
  const layouts = new Map<string, EventLayout>();
  if (items.length === 0) return layouts;

  const sorted = [...items].sort((a, b) => {
    const am = getMins(a.start_time, a.end_time);
    const bm = getMins(b.start_time, b.end_time);
    return am.start !== bm.start ? am.start - bm.start : (bm.end - bm.start) - (am.end - am.start);
  });

  const clusters: LayoutItem[][] = [];
  let cc: LayoutItem[] = [], ce = 0;
  for (const it of sorted) {
    const m = getMins(it.start_time, it.end_time);
    if (cc.length === 0 || m.start < ce) { cc.push(it); ce = Math.max(ce, m.end); }
    else { clusters.push(cc); cc = [it]; ce = m.end; }
  }
  if (cc.length > 0) clusters.push(cc);

  for (const cluster of clusters) {
    if (cluster.length === 1) { layouts.set(cluster[0].id, { isBackground: false, column: 0, totalColumns: 1 }); continue; }

    const durs = cluster.map(it => { const m = getMins(it.start_time, it.end_time); return m.end - m.start; });
    const medDur = [...durs].sort((a, b) => a - b)[Math.floor(durs.length / 2)];

    const bg: LayoutItem[] = [], fg: LayoutItem[] = [];
    for (const it of cluster) {
      const m = getMins(it.start_time, it.end_time);
      const dur = m.end - m.start;
      const oc = cluster.filter(o => o.id !== it.id && overlap(it, o)).length;
      if (!it.isOverlay && dur >= 180 && dur >= medDur * 2 && oc >= 2) bg.push(it);
      else fg.push(it);
    }

    if (bg.length > 0 && fg.length > 0) {
      for (const it of bg) layouts.set(it.id, { isBackground: true, column: 0, totalColumns: 1 });
      assignCols(fg, layouts);
    } else {
      assignCols(cluster, layouts);
    }
  }
  return layouts;
}

function assignCols(items: LayoutItem[], layouts: Map<string, EventLayout>) {
  const sorted = [...items].sort((a, b) => {
    const am = getMins(a.start_time, a.end_time);
    const bm = getMins(b.start_time, b.end_time);
    return am.start !== bm.start ? am.start - bm.start : (bm.end - bm.start) - (am.end - am.start);
  });
  const subs: LayoutItem[][] = [];
  let sc: LayoutItem[] = [], se = 0;
  for (const it of sorted) {
    const m = getMins(it.start_time, it.end_time);
    if (sc.length === 0 || m.start < se) { sc.push(it); se = Math.max(se, m.end); }
    else { subs.push(sc); sc = [it]; se = m.end; }
  }
  if (sc.length > 0) subs.push(sc);

  for (const sub of subs) {
    const colEnds: number[] = [];
    for (const it of sub) {
      const m = getMins(it.start_time, it.end_time);
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (m.start >= colEnds[c]) { colEnds[c] = m.end; layouts.set(it.id, { isBackground: false, column: c, totalColumns: 0 }); placed = true; break; }
      }
      if (!placed) { layouts.set(it.id, { isBackground: false, column: colEnds.length, totalColumns: 0 }); colEnds.push(m.end); }
    }
    const tc = colEnds.length;
    for (const it of sub) { const l = layouts.get(it.id); if (l && !l.isBackground) l.totalColumns = tc; }
  }
}

export function DayView({ currentDate, events, overlayEvents = [], selectedEvent, onSelectEvent, onCreateEvent, onRSVP }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => new Date(), []);
  const isToday = isSameDay(currentDate, today);

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

  // Unified layout: user + overlay events together
  const allLayouts = useMemo(() => {
    const userItems: LayoutItem[] = timedEvents.map(e => ({ id: e.id, start_time: e.start_time, end_time: e.end_time, isOverlay: false }));
    const overlayItems: LayoutItem[] = dayOverlay.map(oe => ({ id: `overlay-${oe.id}`, start_time: oe.start_time, end_time: oe.end_time, isOverlay: true }));
    return computeLayouts([...userItems, ...overlayItems]);
  }, [timedEvents, dayOverlay]);

  const getStyle = useCallback((id: string, start_time: string, end_time: string): React.CSSProperties => {
    const start = new Date(start_time);
    const end = new Date(end_time);
    const startMins = start.getHours() * 60 + start.getMinutes();
    const endMins = end.getHours() * 60 + end.getMinutes();
    const dur = Math.max(endMins - startMins, 15);

    const layout = allLayouts.get(id);
    const isBg = layout?.isBackground ?? false;
    const col = layout?.column ?? 0;
    const totalCols = layout?.totalColumns ?? 1;

    const top = `${(startMins / 60) * HOUR_HEIGHT}px`;
    const height = `${Math.max((dur / 60) * HOUR_HEIGHT - 2, 18)}px`;

    if (isBg) return { position: 'absolute', top, height, left: '1px', right: '2px', zIndex: 10, overflow: 'hidden' };

    const hasBg = [...allLayouts.values()].some(l => l.isBackground);
    const inset = hasBg ? 10 : 0;
    const avail = 100 - inset;
    const cw = avail / totalCols;
    const left = inset + col * cw;

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

  const handleTimeSlotClick = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
    const hour = Math.floor(y / HOUR_HEIGHT);
    const minutes = Math.round(((y % HOUR_HEIGHT) / HOUR_HEIGHT) * 60 / 15) * 15;
    const start = new Date(currentDate);
    start.setHours(hour, minutes, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    onCreateEvent(start, end);
  }, [currentDate, onCreateEvent]);

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
              <EventBlock key={event.id} event={event} selected={selectedEvent?.id === event.id} onClick={onSelectEvent} compact />
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

          <div className={`flex-1 relative border-l border-border-subtle ${isToday ? 'bg-accent-primary/[0.02]' : ''}`} onClick={handleTimeSlotClick}>
            {HOURS.map(hour => (
              <div key={hour} className="hour-slot absolute left-0 right-0" style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }} />
            ))}
            {nowPosition !== null && <div className="now-indicator" style={{ top: `${nowPosition}px` }} />}

            {/* Overlay events — with column layout */}
            {dayOverlay.map(oe => {
              const lid = `overlay-${oe.id}`;
              return (
                <div key={lid} style={getStyle(lid, oe.start_time, oe.end_time)} title={`${oe.personEmail}: ${oe.summary}`}>
                  <div
                    className="h-full rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-tight overflow-hidden border"
                    style={{ backgroundColor: oe.personColor + '25', borderColor: oe.personColor + '60', color: oe.personColor }}
                  >
                    <div className="truncate">{oe.summary}</div>
                    <div className="truncate opacity-70">{formatTime(oe.start_time)}</div>
                  </div>
                </div>
              );
            })}

            {/* User events */}
            {timedEvents.map(event => (
              <div key={event.id} style={getStyle(event.id, event.start_time, event.end_time)}>
                <EventBlock event={event} selected={selectedEvent?.id === event.id} onClick={onSelectEvent} onRSVP={onRSVP} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
