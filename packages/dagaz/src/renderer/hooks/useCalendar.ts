import { useState, useEffect, useCallback, useRef } from 'react';
import { getWeekStart } from '../lib/utils';
import type { CalendarEvent, Calendar, ViewType, SyncState } from '../../shared/types';

export function useCalendar(view: ViewType, currentDate: Date, weekDays: number, isOnline = true, weekendWeekAhead = false) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const getDateRange = useCallback((): { start: string; end: string } => {
    const d = new Date(currentDate);

    switch (view) {
      case 'day': {
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
        return { start: start.toISOString(), end: end.toISOString() };
      }
      case 'week': {
        const start = getWeekStart(d, weekDays, weekendWeekAhead);
        const endDate = new Date(start);
        endDate.setDate(start.getDate() + weekDays);
        return { start: start.toISOString(), end: endDate.toISOString() };
      }
      case 'month': {
        const first = new Date(d.getFullYear(), d.getMonth(), 1);
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const startDay = (first.getDay() + 6) % 7;
        const start = new Date(first);
        start.setDate(start.getDate() - startDay);
        const end = new Date(last);
        end.setDate(end.getDate() + (7 - ((last.getDay() + 6) % 7)) % 7);
        return { start: start.toISOString(), end: end.toISOString() };
      }
      case 'agenda': {
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const end = new Date(start);
        end.setDate(end.getDate() + 14);
        return { start: start.toISOString(), end: end.toISOString() };
      }
      default:
        return { start: d.toISOString(), end: d.toISOString() };
    }
  }, [view, currentDate, weekDays, weekendWeekAhead]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const events = await window.dagaz.getEvents(start, end);
      if (mountedRef.current) setEvents(events || []);
    } catch (e) {
      console.error('[Dagaz] Failed to fetch events:', e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [getDateRange]);

  const fetchCalendars = useCallback(async () => {
    try {
      const cals = await window.dagaz.getCalendars();
      if (mountedRef.current) setCalendars(cals || []);
    } catch (e) {
      console.error('[Dagaz] Failed to fetch calendars:', e);
    }
  }, []);

  const refresh = useCallback(async (opts?: { full?: boolean }) => {
    setLoading(true);
    // Only trigger a network sync when online
    if (isOnline) {
      try {
        await window.dagaz.triggerSync({ full: opts?.full ?? true });
      } catch (e) {
        console.error('[Dagaz] Sync trigger failed:', e);
      }
    }
    // Always read from local cache (works offline)
    try {
      const { start, end } = getDateRange();
      const evts = await window.dagaz.getEvents(start, end);
      if (mountedRef.current) setEvents(evts || []);
      const cals = await window.dagaz.getCalendars();
      if (mountedRef.current) setCalendars(cals || []);
    } catch (e) {
      console.error('[Dagaz] Failed to fetch after sync:', e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [getDateRange, isOnline]);

  // Initial load
  useEffect(() => {
    refresh({ full: false });
  }, [refresh]);

  // Re-sync when coming back online
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      refresh({ full: true });
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, refresh]);

  // Listen for background sync completions and event changes
  useEffect(() => {
    const unsubSync = window.dagaz.onSyncChanged(() => {
      fetchEvents();
    });
    const unsubEvents = window.dagaz.onEventsChanged(() => {
      fetchEvents();
    });
    return () => { unsubSync(); unsubEvents(); };
  }, [fetchEvents]);

  return { events, calendars, loading, refresh, fetchCalendars };
}

export function useSync() {
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'synced',
    lastSync: null,
    pendingCount: 0,
    createFailureCount: 0,
  });

  useEffect(() => {
    window.dagaz.getSyncStatus().then((s) => setSyncState(s as SyncState)).catch((e) => console.error('[Sync] Initial status check failed:', e));

    const unsub = window.dagaz.onSyncChanged((state: any) => {
      setSyncState(state as SyncState);
    });

    return unsub;
  }, []);

  const triggerSync = useCallback(async () => {
    try {
      await window.dagaz.triggerSync();
    } catch (e) {
      console.error('[Dagaz] Trigger sync failed:', e);
    }
  }, []);

  return { ...syncState, triggerSync };
}
