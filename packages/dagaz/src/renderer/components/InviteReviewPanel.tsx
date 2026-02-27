import React, { useMemo, useState } from 'react';
import type { CalendarEvent } from '../../shared/types';
import { formatTime } from '../lib/utils';

type RsvpResponse = 'accepted' | 'declined' | 'tentative';

interface Props {
  events: CalendarEvent[];
  allEvents: CalendarEvent[];
  isLoading: boolean;
  onRefresh: () => void;
  onRsvp: (eventId: string, response: RsvpResponse) => Promise<void>;
  onSelectEvent: (event: CalendarEvent) => void;
  onDateSelect: (date: Date) => void;
}

function hasConflict(event: CalendarEvent, allEvents: CalendarEvent[]): boolean {
  if (event.all_day) return false;
  const eStart = new Date(event.start_time).getTime();
  const eEnd = new Date(event.end_time).getTime();
  return allEvents.some(other => {
    if (other.id === event.id || other.all_day || other.status === 'cancelled') return false;
    if (other.self_response === 'declined') return false;
    const oStart = new Date(other.start_time).getTime();
    const oEnd = new Date(other.end_time).getTime();
    return eStart < oEnd && oStart < eEnd;
  });
}

function formatInviteDateTime(startTime: string, endTime: string): { date: string; time: string } {
  const d = new Date(startTime);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const dateStr = isToday
    ? 'Today'
    : isTomorrow
      ? 'Tomorrow'
      : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const timeStr = `${formatTime(startTime)} – ${formatTime(endTime)}`;

  return { date: dateStr, time: timeStr };
}

export function InviteReviewPanel({ events, allEvents, isLoading, onRefresh, onRsvp, onSelectEvent, onDateSelect }: Props) {
  const eventsWithConflicts = useMemo(
    () => events.map(ev => ({ event: ev, conflict: hasConflict(ev, allEvents) })),
    [events, allEvents],
  );

  const [actionStates, setActionStates] = useState<Record<string, 'loading' | 'done' | 'error'>>({});

  // Prune stale actionStates entries for events no longer in the list
  const eventIds = useMemo(() => new Set(events.map(e => e.id)), [events]);
  React.useEffect(() => {
    setActionStates(prev => {
      const pruned: Record<string, 'loading' | 'done' | 'error'> = {};
      for (const [id, state] of Object.entries(prev)) {
        if (eventIds.has(id)) pruned[id] = state;
      }
      return Object.keys(pruned).length === Object.keys(prev).length ? prev : pruned;
    });
  }, [eventIds]);

  const visibleCount = useMemo(
    () => events.filter(e => actionStates[e.id] !== 'done').length,
    [events, actionStates],
  );

  const handleAction = async (event: CalendarEvent, response: RsvpResponse) => {
    setActionStates(prev => ({ ...prev, [event.id]: 'loading' }));
    try {
      await onRsvp(event.id, response);
      setActionStates(prev => ({ ...prev, [event.id]: 'done' }));
    } catch (e: any) {
      console.error(`[Dagaz] RSVP failed for "${event.summary}":`, e);
      setActionStates(prev => ({ ...prev, [event.id]: 'error' }));
    }
  };

  return (
    <div className="w-80 border-l border-border-subtle bg-bg-secondary flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-text-primary">Needs Response</h2>
          {visibleCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-accent-primary/20 text-accent-primary text-[10px] font-semibold">
              {visibleCount}
            </span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <svg
            className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {visibleCount === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-text-muted px-6">
            <svg className="w-8 h-8 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs">All caught up</span>
          </div>
        )}
        {eventsWithConflicts.map(({ event, conflict }, idx) => {
          const { date, time } = formatInviteDateTime(event.start_time, event.end_time);
          const state = actionStates[event.id];
          if (state === 'done') return null;

          return (
            <div
              key={event.id}
              className={`p-4 ${idx > 0 ? 'border-t border-border-subtle' : ''} hover:bg-bg-hover/50 transition-colors`}
            >
              {/* Title */}
              <div
                className="text-sm font-medium text-text-primary cursor-pointer hover:text-accent-primary transition-colors leading-snug"
                onClick={() => onSelectEvent(event)}
                title={event.summary}
              >
                {event.summary}
              </div>

              {/* Date & time */}
              <div className="flex items-center gap-1.5 mt-1.5">
                <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs text-text-secondary">{date}</span>
              </div>
              {time && (
                <div className="flex items-center gap-1.5 mt-1">
                  <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs text-accent-primary font-medium">{time}</span>
                </div>
              )}

              {/* Location */}
              {event.location && (
                <div className="flex items-center gap-1.5 mt-1">
                  <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-xs text-text-secondary truncate" title={event.location}>
                    {event.location}
                  </span>
                </div>
              )}

              {/* Organizer */}
              <div className="flex items-center gap-1.5 mt-1.5">
                <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-xs text-text-secondary truncate" title={event.organizer_email || undefined}>
                  {event.organizer_name || event.organizer_email || 'Unknown organizer'}
                </span>
              </div>

              {/* Attendee count */}
              {event.attendees && event.attendees.length > 2 && (
                <div className="flex items-center gap-1.5 mt-1">
                  <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-xs text-text-muted">
                    {event.attendees.length} attendees
                  </span>
                </div>
              )}

              {/* Conflict warning */}
              {conflict && (
                <div className="flex items-center gap-1.5 mt-2 px-2 py-1.5 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                  <svg className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-[10px] text-yellow-400 font-medium">Conflicts with existing event</span>
                </div>
              )}

              {/* Actions — always visible for fast triage */}
              {state === 'loading' ? (
                <div className="mt-3 text-xs text-text-muted animate-pulse">Updating...</div>
              ) : state === 'error' ? (
                <div className="flex gap-2 mt-3">
                  <span className="text-xs text-red-400">Failed</span>
                  <button
                    onClick={() => handleAction(event, 'accepted')}
                    className="text-xs text-red-400 hover:text-red-300 underline transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAction(event, 'accepted'); }}
                    className="flex-1 px-2 py-1.5 rounded-md text-xs font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAction(event, 'tentative'); }}
                    className="flex-1 px-2 py-1.5 rounded-md text-xs font-medium bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-colors"
                  >
                    Maybe
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAction(event, 'declined'); }}
                    className="flex-1 px-2 py-1.5 rounded-md text-xs font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
