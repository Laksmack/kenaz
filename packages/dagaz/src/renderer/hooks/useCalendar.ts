import { useState, useEffect, useCallback, useRef } from 'react';
import type { CalendarEvent, Calendar, ViewType, SyncState } from '../../shared/types';

export function useCalendar(view: ViewType, currentDate: Date, weekDays: 5 | 7) {
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
        const dayOfWeek = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
        monday.setHours(0, 0, 0, 0);
        const endDate = new Date(monday);
        endDate.setDate(monday.getDate() + weekDays);
        return { start: monday.toISOString(), end: endDate.toISOString() };
      }
      case 'month': {
        const first = new Date(d.getFullYear(), d.getMonth(), 1);
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        // Extend to cover visible days from adjacent months
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
  }, [view, currentDate, weekDays]);

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

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Trigger a real backend sync first, then read updated cache
      await window.dagaz.triggerSync();
    } catch (e) {
      console.error('[Dagaz] Sync trigger failed:', e);
    }
    await Promise.all([fetchEvents(), fetchCalendars()]);
  }, [fetchEvents, fetchCalendars]);

  // Initial load and refresh on changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for sync and event changes
  useEffect(() => {
    const unsubSync = window.dagaz.onSyncChanged(() => {
      fetchEvents();
    });

    const handleEventsChanged = () => fetchEvents();
    // The 'events:changed' message is sent via IPC when events are modified
    // We use the electron IPC listener pattern from preload

    return () => {
      unsubSync();
    };
  }, [fetchEvents]);

  return {
    events,
    calendars,
    loading,
    refresh,
    fetchCalendars,
  };
}

export function useSync() {
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'synced',
    lastSync: null,
    pendingCount: 0,
  });

  useEffect(() => {
    window.dagaz.getSyncStatus().then((s) => setSyncState(s as SyncState)).catch(() => {});

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
