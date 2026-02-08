import { useState, useEffect, useCallback } from 'react';
import type { CalendarEvent } from '@shared/types';

export function useCalendar(enabled: boolean) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchToday = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.kenaz.calendarToday();
      setEvents(result);
    } catch (e: any) {
      console.error('Failed to fetch calendar:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  // Fetch on mount and every 5 minutes
  useEffect(() => {
    fetchToday();
    const interval = setInterval(fetchToday, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchToday]);

  return { events, loading, error, refresh: fetchToday };
}
