import { useState, useEffect, useCallback } from 'react';
import type { ViewType, OverlayPerson, OverlayEvent } from '../../shared/types';
import { OVERLAY_COLORS } from '../../shared/types';

export function useOverlay(currentDate: Date, currentView: ViewType, weekDays: number) {
  const [overlayPeople, setOverlayPeople] = useState<OverlayPerson[]>([]);
  const [overlayEvents, setOverlayEvents] = useState<OverlayEvent[]>([]);

  const initOverlayPeople = useCallback((people: OverlayPerson[]) => {
    setOverlayPeople(people);
  }, []);

  const saveOverlayPeople = useCallback((people: OverlayPerson[]) => {
    setOverlayPeople(people);
    window.dagaz.setConfig({ overlayPeople: people });
  }, []);

  const addOverlayPerson = useCallback((email: string, name?: string) => {
    setOverlayPeople(prev => {
      const usedColors = new Set(prev.map(p => p.color));
      const nextColor = OVERLAY_COLORS.find(c => !usedColors.has(c)) || OVERLAY_COLORS[prev.length % OVERLAY_COLORS.length];
      const updated = [...prev, { email, name, color: nextColor, visible: true }];
      window.dagaz.setConfig({ overlayPeople: updated });
      return updated;
    });
  }, []);

  const removeOverlayPerson = useCallback((email: string) => {
    setOverlayPeople(prev => {
      const updated = prev.filter(p => p.email !== email);
      window.dagaz.setConfig({ overlayPeople: updated });
      return updated;
    });
    setOverlayEvents(prev => prev.filter(e => e.personEmail !== email));
  }, []);

  const toggleOverlayPerson = useCallback((email: string, visible: boolean) => {
    setOverlayPeople(prev => {
      const updated = prev.map(p => p.email === email ? { ...p, visible } : p);
      window.dagaz.setConfig({ overlayPeople: updated });
      return updated;
    });
  }, []);

  // Fetch overlay events when view/date changes or people change
  useEffect(() => {
    const visiblePeople = overlayPeople.filter(p => p.visible);
    if (visiblePeople.length === 0) {
      setOverlayEvents([]);
      return;
    }

    let start: Date, end: Date;
    if (currentView === 'day') {
      start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    } else if (currentView === 'week') {
      const d = new Date(currentDate);
      const dayOfWeek = d.getDay();
      start = new Date(d);
      start.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + weekDays);
    } else if (currentView === 'month') {
      start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    } else {
      start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 7);
    }

    let cancelled = false;
    (async () => {
      const allEvents: OverlayEvent[] = [];
      await Promise.all(visiblePeople.map(async (person) => {
        try {
          const result = await window.dagaz.fetchOverlayEvents(
            person.email, start.toISOString(), end.toISOString()
          );
          if (cancelled) return;
          if (result.success) {
            for (const ev of result.events) {
              allEvents.push({
                ...ev,
                personEmail: person.email,
                personColor: person.color,
              });
            }
          }
        } catch {
          // silently skip on error
        }
      }));
      if (!cancelled) setOverlayEvents(allEvents);
    })();

    return () => { cancelled = true; };
  }, [overlayPeople, currentDate, currentView, weekDays]);

  return {
    overlayPeople,
    overlayEvents,
    initOverlayPeople,
    saveOverlayPeople,
    addOverlayPerson,
    removeOverlayPerson,
    toggleOverlayPerson,
  };
}
