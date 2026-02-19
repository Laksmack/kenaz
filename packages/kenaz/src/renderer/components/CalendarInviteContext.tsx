import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { CalendarEvent } from '@shared/types';

interface InviteInfo {
  summary: string;
  start: Date;
  end: Date;
  eventId: string | null;
}

interface Props {
  invite: InviteInfo;
}

const HOUR_HEIGHT = 36;

export function CalendarInviteContext({ invite }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inviteDate = invite.start;
  const dateStr = inviteDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  });

  // Fetch the day's events from Dagaz
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const dayStart = new Date(inviteDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(inviteDate);
    dayEnd.setHours(23, 59, 59, 999);

    window.kenaz.calendarRange(dayStart.toISOString(), dayEnd.toISOString())
      .then((result) => {
        if (!cancelled) setEvents(result);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message || 'Failed to load calendar');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [inviteDate.toDateString()]);

  // Determine visible hour range: show ~2 hours before to ~1 hour after the last event
  const { startHour, endHour, timedEvents } = useMemo(() => {
    const timed = events.filter(e => !e.allDay);
    const inviteStartH = invite.start.getHours();
    const inviteEndH = invite.end.getHours() + (invite.end.getMinutes() > 0 ? 1 : 0);

    let minH = inviteStartH;
    let maxH = inviteEndH;
    for (const e of timed) {
      const sh = new Date(e.start).getHours();
      const eh = new Date(e.end).getHours() + (new Date(e.end).getMinutes() > 0 ? 1 : 0);
      minH = Math.min(minH, sh);
      maxH = Math.max(maxH, eh);
    }

    return {
      startHour: Math.max(0, minH - 1),
      endHour: Math.min(24, maxH + 1),
      timedEvents: timed,
    };
  }, [events, invite]);

  // Find conflicts
  const conflicts = useMemo(() => {
    const iStart = invite.start.getTime();
    const iEnd = invite.end.getTime();
    return timedEvents.filter(e => {
      if (invite.eventId && e.id === invite.eventId) return false;
      const eStart = new Date(e.start).getTime();
      const eEnd = new Date(e.end).getTime();
      return eStart < iEnd && eEnd > iStart;
    });
  }, [timedEvents, invite]);

  const totalHeight = (endHour - startHour) * HOUR_HEIGHT;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  const getBlockStyle = useCallback((start: Date, end: Date): React.CSSProperties => {
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = end.getHours() * 60 + end.getMinutes();
    const dur = Math.max(endMin - startMin, 15);
    const offsetMin = startMin - startHour * 60;

    return {
      position: 'absolute',
      top: `${(offsetMin / 60) * HOUR_HEIGHT}px`,
      height: `${Math.max((dur / 60) * HOUR_HEIGHT - 1, 14)}px`,
      left: '1px',
      right: '1px',
      overflow: 'hidden',
    };
  }, [startHour]);

  return (
    <div className="p-3">
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2">
        <svg className="w-3.5 h-3.5 text-accent-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Invite Preview</span>
      </div>

      {/* Invite summary */}
      <div className="mb-2 px-2 py-1.5 rounded-md bg-accent-primary/10 border border-accent-primary/25">
        <div className="text-xs font-medium text-accent-primary truncate">{invite.summary}</div>
        <div className="text-[10px] text-text-secondary mt-0.5">
          {dateStr} &middot; {formatTime(invite.start)} – {formatTime(invite.end)}
        </div>
      </div>

      {/* Conflict summary */}
      {!loading && !error && (
        <div className={`text-[10px] font-medium mb-2 px-1 ${
          conflicts.length > 0 ? 'text-yellow-400' : 'text-green-400'
        }`}>
          {conflicts.length === 0
            ? '✓ No conflicts — you\'re free'
            : `⚠ Conflicts with ${conflicts.length} event${conflicts.length > 1 ? 's' : ''}`
          }
        </div>
      )}

      {loading && (
        <div className="text-[10px] text-text-muted text-center py-4 animate-pulse">Loading calendar...</div>
      )}

      {error && (
        <div className="text-[10px] text-accent-danger mb-2">Calendar: {error}</div>
      )}

      {/* Mini timeline */}
      {!loading && !error && (
        <div className="relative rounded-md overflow-hidden bg-bg-primary border border-border-subtle" style={{ height: `${totalHeight}px` }}>
          {/* Hour grid */}
          {hours.map(h => (
            <div key={h} className="absolute left-0 right-0 border-t border-border-subtle/50" style={{ top: `${(h - startHour) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}>
              <span className="text-[9px] text-text-muted/60 ml-1 leading-none">{formatHour(h)}</span>
            </div>
          ))}

          {/* Invite event block (highlighted) */}
          <div style={getBlockStyle(invite.start, invite.end)}>
            <div className="h-full rounded-[3px] border-2 border-accent-primary/60 bg-accent-primary/15 px-1 py-0.5 border-dashed">
              <div className="text-[9px] font-semibold text-accent-primary truncate leading-tight">{invite.summary}</div>
              <div className="text-[8px] text-accent-primary/70">{formatTime(invite.start)}</div>
            </div>
          </div>

          {/* Existing calendar events */}
          {timedEvents.map(event => {
            if (invite.eventId && event.id === invite.eventId) return null;
            const eStart = new Date(event.start);
            const eEnd = new Date(event.end);
            const isConflict = conflicts.some(c => c.id === event.id);
            return (
              <div key={event.id} style={getBlockStyle(eStart, eEnd)}>
                <div
                  className={`h-full rounded-[3px] px-1 py-0.5 border ${isConflict ? 'border-yellow-500/50' : 'border-transparent'}`}
                  style={{
                    backgroundColor: isConflict
                      ? (event.calendarColor || '#4A9AC2') + '40'
                      : (event.calendarColor || '#4A9AC2') + '25',
                  }}
                >
                  <div className="text-[9px] font-medium text-text-primary truncate leading-tight">{event.summary}</div>
                  <div className="text-[8px] text-text-muted">{formatTime(eStart)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatHour(hour: number): string {
  if (hour === 0) return '12a';
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return '12p';
  return `${hour - 12}p`;
}
