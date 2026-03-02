import type { CalendarEvent, OverlayEvent } from '../../shared/types';

export const HOUR_HEIGHT = 60;
export const HOURS = Array.from({ length: 24 }, (_, i) => i);

export type LayoutItem = {
  id: string;
  start_time: string;
  end_time: string;
  isOverlay: boolean;
  source?: CalendarEvent | OverlayEvent;
};

export type EventLayout = {
  column: number;
  totalColumns: number;
};

export function getMinutesFromTime(start_time: string, end_time: string) {
  const s = new Date(start_time);
  const e = new Date(end_time);
  const start = s.getHours() * 60 + s.getMinutes();
  let end = e.getHours() * 60 + e.getMinutes();
  // Handle events that cross midnight or end at midnight next day
  if (end <= start && e.getTime() > s.getTime()) end = 24 * 60;
  return { start, end: Math.max(end, start + 15) };
}

export function timeOverlaps(s1: string, e1: string, s2: string, e2: string): boolean {
  return new Date(s1).getTime() < new Date(e2).getTime() && new Date(s2).getTime() < new Date(e1).getTime();
}

/**
 * Assign side-by-side columns to overlapping events.
 * Uses a single-pass greedy algorithm (same approach as Google Calendar):
 * 1. Sort by start time, longest first for ties
 * 2. Group into transitive overlap clusters
 * 3. Greedily assign columns within each cluster
 * 4. All events in a cluster share the same totalColumns
 */
export function computeLayouts(items: LayoutItem[]): Map<string, EventLayout> {
  const layouts = new Map<string, EventLayout>();
  if (items.length === 0) return layouts;

  const sorted = [...items].sort((a, b) => {
    const am = getMinutesFromTime(a.start_time, a.end_time);
    const bm = getMinutesFromTime(b.start_time, b.end_time);
    if (am.start !== bm.start) return am.start - bm.start;
    return (bm.end - bm.start) - (am.end - am.start);
  });

  // Build transitive overlap groups
  const groups: LayoutItem[][] = [];
  let group: LayoutItem[] = [];
  let groupEnd = 0;

  for (const item of sorted) {
    const m = getMinutesFromTime(item.start_time, item.end_time);
    if (group.length === 0 || m.start < groupEnd) {
      group.push(item);
      groupEnd = Math.max(groupEnd, m.end);
    } else {
      groups.push(group);
      group = [item];
      groupEnd = m.end;
    }
  }
  if (group.length > 0) groups.push(group);

  for (const grp of groups) {
    if (grp.length === 1) {
      layouts.set(grp[0].id, { column: 0, totalColumns: 1 });
      continue;
    }

    // Greedy column assignment
    const colEnds: number[] = [];
    for (const item of grp) {
      const m = getMinutesFromTime(item.start_time, item.end_time);
      let placed = false;
      for (let col = 0; col < colEnds.length; col++) {
        if (m.start >= colEnds[col]) {
          colEnds[col] = m.end;
          layouts.set(item.id, { column: col, totalColumns: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        layouts.set(item.id, { column: colEnds.length, totalColumns: 0 });
        colEnds.push(m.end);
      }
    }

    const totalCols = colEnds.length;
    for (const item of grp) {
      const l = layouts.get(item.id);
      if (l) l.totalColumns = totalCols;
    }
  }

  return layouts;
}

export function overlayToEvent(oe: OverlayEvent): CalendarEvent {
  return {
    id: `overlay-${oe.personEmail}::${oe.id}`,
    google_id: null, calendar_id: oe.personEmail,
    summary: oe.summary, description: '', location: '',
    start_time: oe.start_time, end_time: oe.end_time,
    start_date: oe.start_date ?? null, end_date: oe.end_date ?? null,
    all_day: oe.all_day, time_zone: null,
    status: oe.status as 'confirmed' | 'tentative' | 'cancelled',
    self_response: null, organizer_email: oe.personEmail, organizer_name: null,
    is_organizer: false, recurrence_rule: null, recurring_event_id: null,
    html_link: null, hangout_link: null, conference_data: null,
    transparency: 'opaque', visibility: 'default', color_id: null,
    reminders: null, etag: null, local_only: true,
    pending_action: null, pending_payload: null,
    created_at: '', updated_at: '',
    calendar_color: oe.personColor,
  };
}
