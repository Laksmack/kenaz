import { useState, useEffect, useCallback } from 'react';
import type { CalendarEvent } from '@shared/types';

export function useCalendar(enabled: boolean) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayOffset, setDayOffset] = useState(0);

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + dayOffset);

  const fetchDay = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      if (dayOffset === 0) {
        // Use the optimized "today" endpoint
        const result = await window.kenaz.calendarToday();
        setEvents(result);
      } else {
        // Use range endpoint for other days
        const start = new Date(targetDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(targetDate);
        end.setHours(23, 59, 59, 999);
        const result = await window.kenaz.calendarRange(start.toISOString(), end.toISOString());
        setEvents(result);
      }
    } catch (e: any) {
      console.error('Failed to fetch calendar:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [enabled, dayOffset]);

  // Fetch on mount, on day change, and every 5 minutes
  useEffect(() => {
    fetchDay();
    const interval = setInterval(fetchDay, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchDay]);

  const goNext = useCallback(() => setDayOffset((d) => d + 1), []);
  const goPrev = useCallback(() => setDayOffset((d) => d - 1), []);
  const goToday = useCallback(() => setDayOffset(0), []);

  return { events, loading, error, refresh: fetchDay, dayOffset, targetDate, goNext, goPrev, goToday };
}
