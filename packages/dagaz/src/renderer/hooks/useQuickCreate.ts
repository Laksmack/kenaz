import { useState, useCallback } from 'react';
import type { CalendarEvent } from '../../shared/types';

export function useQuickCreate() {
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateStart, setQuickCreateStart] = useState<Date | undefined>();
  const [quickCreateEnd, setQuickCreateEnd] = useState<Date | undefined>();
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  const openQuickCreate = useCallback((start?: Date, end?: Date) => {
    setEditingEvent(null);
    setQuickCreateStart(start);
    setQuickCreateEnd(end);
    setQuickCreateOpen(true);
  }, []);

  const openEditEvent = useCallback((event: CalendarEvent) => {
    setEditingEvent(event);
    setQuickCreateOpen(true);
  }, []);

  const closeQuickCreate = useCallback(() => {
    setQuickCreateOpen(false);
    setEditingEvent(null);
  }, []);

  return {
    quickCreateOpen,
    quickCreateStart,
    quickCreateEnd,
    editingEvent,
    setEditingEvent,
    openQuickCreate,
    openEditEvent,
    closeQuickCreate,
  };
}
