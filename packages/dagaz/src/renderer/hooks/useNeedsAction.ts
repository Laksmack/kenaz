import { useState, useEffect, useCallback, useRef } from 'react';
import type { CalendarEvent } from '../../shared/types';

const DEFAULT_INTERVAL = 60000; // 1 minute (matches incremental sync cadence)

export function useNeedsAction(intervalMs?: number) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.dagaz.getNeedsActionEvents();
      if (mountedRef.current) {
        setEvents(result || []);
      }
    } catch {
      // keep existing state
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, intervalMs ?? DEFAULT_INTERVAL);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  // Also refresh when events change (sync completed, RSVP submitted, etc.)
  useEffect(() => {
    const unsub = window.dagaz.onSyncChanged(() => refresh());
    return unsub;
  }, [refresh]);

  return {
    events,
    count: events.length,
    isLoading,
    refresh,
  };
}
