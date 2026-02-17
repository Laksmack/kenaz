import React, { useMemo } from 'react';
import type { CalendarEvent } from '../../shared/types';
import { getMonthDates, isSameDay, dateKey } from '../lib/utils';

interface Props {
  currentDate: Date;
  events: CalendarEvent[];
  selectedEvent: CalendarEvent | null;
  onSelectEvent: (event: CalendarEvent) => void;
  onDateSelect: (date: Date) => void;
}

export function MonthView({ currentDate, events, selectedEvent, onSelectEvent, onDateSelect }: Props) {
  const today = useMemo(() => new Date(), []);
  const monthDates = useMemo(
    () => getMonthDates(currentDate.getFullYear(), currentDate.getMonth()),
    [currentDate]
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();

    for (const event of events) {
      if (event.all_day) {
        const start = new Date(event.start_date || event.start_time);
        const end = new Date(event.end_date || event.end_time);
        for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
          const key = dateKey(d);
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(event);
        }
      } else {
        const start = new Date(event.start_time);
        const key = dateKey(start);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(event);
      }
    }

    return map;
  }, [events]);

  return (
    <div className="flex flex-col h-full">
      {/* Day of week headers */}
      <div className="grid grid-cols-7 border-b border-border-subtle flex-shrink-0">
        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
          <div key={day} className="text-center py-2 text-[10px] uppercase tracking-wider text-text-muted border-l border-border-subtle first:border-l-0">
            {day.slice(0, 3)}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 min-h-0">
        {monthDates.map((d, i) => {
          const isToday = isSameDay(d, today);
          const isCurrentMonth = d.getMonth() === currentDate.getMonth();
          const key = dateKey(d);
          const dayEvents = eventsByDay.get(key) || [];

          return (
            <div
              key={i}
              className={`border-l border-b border-border-subtle first:border-l-0 p-1 min-h-0 overflow-hidden cursor-pointer hover:bg-bg-hover/50 transition-colors ${
                !isCurrentMonth ? 'opacity-40' : ''
              }`}
              onClick={() => onDateSelect(d)}
            >
              <div className={`text-xs mb-0.5 ${
                isToday
                  ? 'w-6 h-6 rounded-full bg-accent-primary text-white flex items-center justify-center font-medium'
                  : 'text-text-primary px-1'
              }`}>
                {d.getDate()}
              </div>

              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(event => (
                  <div
                    key={event.id}
                    className={`text-[10px] px-1 py-0.5 rounded-sm truncate cursor-pointer ${
                      selectedEvent?.id === event.id ? 'ring-1 ring-accent-primary' : ''
                    }`}
                    style={{
                      backgroundColor: `${event.calendar_color || '#4A9AC2'}20`,
                      color: event.calendar_color || '#4A9AC2',
                    }}
                    onClick={(e) => { e.stopPropagation(); onSelectEvent(event); }}
                  >
                    {!event.all_day && (
                      <span className="opacity-70">
                        {new Date(event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '')}
                        {' '}
                      </span>
                    )}
                    {event.summary}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[9px] text-text-muted px-1">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
