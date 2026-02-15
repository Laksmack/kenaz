import React from 'react';
import type { CalendarEvent } from '@shared/types';
import { useCalendar } from '../hooks/useCalendar';

interface Props {
  enabled: boolean;
}

export function CalendarWidget({ enabled }: Props) {
  const { events, loading, error, dayOffset, targetDate, goNext, goPrev, goToday } = useCalendar(enabled);

  const now = new Date();
  const isToday = dayOffset === 0;
  const currentTime = now.getTime();

  // Split events into current/upcoming and past (only meaningful for today)
  const upcomingEvents = events.filter((e) => !e.allDay && (!isToday || new Date(e.end).getTime() > currentTime));
  const allDayEvents = events.filter((e) => e.allDay);
  const pastEvents = isToday
    ? events.filter((e) => !e.allDay && new Date(e.end).getTime() <= currentTime)
    : [];

  // Find the current event (only for today)
  const currentEvent = isToday
    ? upcomingEvents.find(
        (e) => new Date(e.start).getTime() <= currentTime && new Date(e.end).getTime() > currentTime
      )
    : null;

  const dayLabel = isToday
    ? 'Today'
    : dayOffset === 1
    ? 'Tomorrow'
    : dayOffset === -1
    ? 'Yesterday'
    : targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const dateStr = targetDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Google Calendar URL for the target date
  const gcalDate = targetDate.toISOString().slice(0, 10).replace(/-/g, '/');
  const gcalUrl = `https://calendar.google.com/calendar/r/day/${gcalDate}`;

  return (
    <div className="p-3">
      {/* Header with navigation */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button
            onClick={goPrev}
            className="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
            title="Previous day"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={goToday}
            className={`text-xs font-semibold uppercase tracking-wider px-1 rounded transition-colors w-[72px] text-center ${
              isToday ? 'text-text-muted' : 'text-accent-primary hover:bg-bg-hover cursor-pointer'
            }`}
            title={isToday ? dateStr : 'Back to today'}
            disabled={isToday}
          >
            {dayLabel}
          </button>
          <button
            onClick={goNext}
            className="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
            title="Next day"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-text-muted">{dateStr}</span>
          <a
            href={gcalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
            title="Open in Google Calendar"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        </div>
      </div>

      {loading && events.length === 0 && (
        <div className="text-xs text-text-muted text-center py-3">Loading calendar...</div>
      )}

      {error && (
        <div className="text-xs text-accent-danger mb-2">Calendar: {error}</div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="text-xs text-text-muted text-center py-3">
          No events {isToday ? 'today' : 'this day'}
        </div>
      )}

      <div className="space-y-1">
        {/* All day events */}
        {allDayEvents.map((event) => (
          <AllDayEventRow key={event.id} event={event} />
        ))}

        {/* Upcoming / current events */}
        {upcomingEvents.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            isCurrent={event.id === currentEvent?.id}
          />
        ))}

        {/* Past events (dimmed, today only) */}
        {pastEvents.length > 0 && (
          <div className="pt-1 mt-1 border-t border-border-subtle">
            {pastEvents.map((event) => (
              <EventRow key={event.id} event={event} isPast />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EventRow({
  event,
  isCurrent = false,
  isPast = false,
}: {
  event: CalendarEvent;
  isCurrent?: boolean;
  isPast?: boolean;
}) {
  const startTime = formatTime(event.start);
  const endTime = formatTime(event.end);
  const hasVideoLink = event.meetLink || event.hangoutLink;

  return (
    <div
      className={`flex items-start gap-2 px-2 py-1.5 rounded-lg transition-colors ${
        isCurrent
          ? 'bg-accent-primary/10 border border-accent-primary/20'
          : isPast
          ? 'opacity-40'
          : 'hover:bg-bg-hover'
      }`}
    >
      {/* Color bar */}
      <div
        className="w-0.5 h-full min-h-[28px] rounded-full flex-shrink-0 mt-0.5"
        style={{ backgroundColor: event.calendarColor }}
      />

      <div className="flex-1 min-w-0">
        <div className={`text-xs font-medium truncate ${isCurrent ? 'text-accent-primary' : 'text-text-primary'}`}>
          {event.summary}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-text-muted">
            {startTime} – {endTime}
          </span>
          {isCurrent && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-accent-primary/20 text-accent-primary font-medium">NOW</span>
          )}
        </div>
        {event.location && !hasVideoLink && (
          <div className="text-[10px] text-text-muted truncate mt-0.5">{event.location}</div>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          {hasVideoLink && (
            <a
              href={event.meetLink || event.hangoutLink}
              className="text-[10px] text-accent-primary hover:underline flex items-center gap-0.5"
              title="Join video call"
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Join
            </a>
          )}
          {event.attendees.length > 1 && (
            <span className="text-[10px] text-text-muted">
              {event.attendees.length} attendees
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function AllDayEventRow({ event }: { event: CalendarEvent }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-bg-hover">
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: event.calendarColor }}
      />
      <span className="text-xs text-text-secondary truncate">{event.summary}</span>
      <span className="text-[9px] text-text-muted flex-shrink-0">all day</span>
    </div>
  );
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
