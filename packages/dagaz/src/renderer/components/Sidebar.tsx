import React, { useState, useMemo } from 'react';
import type { Calendar, CalendarEvent, ViewType, PendingInvite } from '../../shared/types';
import { getMonthDates, isSameDay, dateKey, formatTime } from '../lib/utils';
import { PendingInvitesPanel } from './PendingInvitesPanel';

interface Props {
  calendars: Calendar[];
  currentDate: Date;
  onDateSelect: (date: Date) => void;
  onCalendarToggle: (id: string, visible: boolean) => void;
  todayEvents: CalendarEvent[];
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  pendingInvites: PendingInvite[];
  pendingInvitesLoading: boolean;
  onRefreshInvites: () => void;
  onDismissInvite: (threadId: string) => void;
  children?: React.ReactNode;
}

export function Sidebar({
  calendars, currentDate, onDateSelect, onCalendarToggle,
  todayEvents, currentView, onViewChange,
  pendingInvites, pendingInvitesLoading, onRefreshInvites, onDismissInvite,
  children,
}: Props) {
  const [miniCalMonth, setMiniCalMonth] = useState(() => {
    const d = new Date(currentDate);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const today = useMemo(() => new Date(), []);

  const monthDates = useMemo(
    () => getMonthDates(miniCalMonth.year, miniCalMonth.month),
    [miniCalMonth.year, miniCalMonth.month]
  );

  const monthLabel = new Date(miniCalMonth.year, miniCalMonth.month).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const prevMonth = () => {
    setMiniCalMonth(prev => {
      const d = new Date(prev.year, prev.month - 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const nextMonth = () => {
    setMiniCalMonth(prev => {
      const d = new Date(prev.year, prev.month + 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return todayEvents
      .filter(e => !e.all_day && new Date(e.end_time) > now)
      .slice(0, 5);
  }, [todayEvents]);

  return (
    <div className="h-full flex flex-col pt-10 pb-3 px-3 overflow-y-auto scrollbar-thin">
      {/* Mini Calendar */}
      <div className="mb-4 p-2 rounded-lg bg-bg-secondary">
        <div className="flex items-center justify-between mb-2 px-1">
          <button onClick={prevMonth} className="p-1 rounded hover:bg-bg-hover text-text-secondary">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-xs font-medium text-text-primary">{monthLabel}</span>
          <button onClick={nextMonth} className="p-1 rounded hover:bg-bg-hover text-text-secondary">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day of week headers */}
        <div className="grid grid-cols-7 mb-1">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={i} className="text-center text-[10px] text-text-muted font-medium py-0.5">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {monthDates.map((d, i) => {
            const isToday = isSameDay(d, today);
            const isSelected = isSameDay(d, currentDate);
            const isOtherMonth = d.getMonth() !== miniCalMonth.month;

            return (
              <button
                key={i}
                onClick={() => onDateSelect(d)}
                className={`
                  mini-cal-day relative
                  ${isToday ? 'today' : ''}
                  ${isSelected && !isToday ? 'selected' : ''}
                  ${isOtherMonth ? 'other-month' : ''}
                `}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Calendar List */}
      <div className="mb-4">
        <h3 className="text-[10px] uppercase tracking-wider text-text-muted font-medium px-2 mb-2">Calendars</h3>
        {calendars.map(cal => (
          <label key={cal.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-hover cursor-pointer">
            <input
              type="checkbox"
              checked={cal.visible}
              onChange={() => onCalendarToggle(cal.id, !cal.visible)}
              className="sr-only"
            />
            <span
              className={`w-3 h-3 rounded-sm flex-shrink-0 border transition-colors ${
                cal.visible
                  ? 'border-transparent'
                  : 'border-border-subtle'
              }`}
              style={{
                backgroundColor: cal.visible
                  ? (cal.color_override || cal.background_color || '#4A9AC2')
                  : 'transparent',
              }}
            >
              {cal.visible && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
            <span className={`text-xs truncate ${cal.visible ? 'text-text-primary' : 'text-text-muted'}`}>
              {cal.summary}
            </span>
          </label>
        ))}
      </div>

      {/* People Overlay (children) */}
      {children}

      {/* Pending Invites */}
      <PendingInvitesPanel
        invites={pendingInvites}
        isLoading={pendingInvitesLoading}
        onRefresh={onRefreshInvites}
        onDismiss={onDismissInvite}
        confirmedEvents={todayEvents}
        onDateSelect={onDateSelect}
      />

      {/* Today's Agenda */}
      <div className="flex-1">
        <h3 className="text-[10px] uppercase tracking-wider text-text-muted font-medium px-2 mb-2">Today</h3>
        {upcomingEvents.length === 0 ? (
          <p className="text-xs text-text-muted px-2">No more events today</p>
        ) : (
          <div className="space-y-1">
            {upcomingEvents.map(event => (
              <div
                key={event.id}
                className="px-2 py-1.5 rounded-md hover:bg-bg-hover cursor-pointer"
                onClick={() => onDateSelect(new Date(event.start_time))}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: event.calendar_color || '#4A9AC2' }}
                  />
                  <span className="text-xs text-text-primary truncate">{event.summary}</span>
                </div>
                <span className="text-[10px] text-text-muted ml-3">
                  {formatTime(event.start_time)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
