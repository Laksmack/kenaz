import type { CalendarEvent, OverlayEvent, PendingInvite } from '../../shared/types';

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

const FLOATING_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
const HAS_EXPLICIT_OFFSET_RE = /(Z|[+-]\d{2}:\d{2})$/;

function zonedWallClockToUtcMs(value: string, timeZone: string): number {
  const match = value.match(FLOATING_DATE_TIME_RE);
  if (!match) return Number.NaN;
  const [, y, mo, d, h, mi, s] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s || '0');
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, second);

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  let guess = desiredUtc;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(
      fmt.formatToParts(new Date(guess))
        .filter(p => p.type !== 'literal')
        .map(p => [p.type, p.value]),
    ) as Record<string, string>;
    const representedUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const delta = desiredUtc - representedUtc;
    if (delta === 0) return guess;
    guess += delta;
  }
  return guess;
}

/**
 * Parse event timestamps to a comparable UTC epoch.
 * - If the timestamp already includes an offset/Z, native parsing is correct.
 * - If it's floating (no offset) and a timezone is provided, interpret it in that timezone.
 */
export function toComparableUtcMs(value: string, timeZone?: string | null): number {
  if (!value) return Number.NaN;
  if (HAS_EXPLICIT_OFFSET_RE.test(value) || !timeZone) return new Date(value).getTime();
  const zoned = zonedWallClockToUtcMs(value, timeZone);
  if (!Number.isNaN(zoned)) return zoned;
  return new Date(value).getTime();
}

/**
 * Check if a pending invite likely represents the same meeting as a calendar event.
 * Matches by title similarity + overlapping time window.
 * Used to avoid false conflict warnings when an organizer updates a meeting
 * (e.g. adding conferencing) — the "Updated Invitation" email should not
 * conflict with the calendar event it describes.
 */
export function inviteMatchesEvent(invite: PendingInvite, event: CalendarEvent): boolean {
  if (!invite.startTime || !invite.endTime) return false;
  // Title must match (case-insensitive, trimmed)
  if (invite.title.trim().toLowerCase() !== event.summary.trim().toLowerCase()) return false;
  // Times must overlap (the invite IS this event)
  return timeOverlaps(invite.startTime, invite.endTime, event.start_time, event.end_time);
}

/** Returns true if the event should be excluded from conflict checks */
export function isExcludedFromConflicts(event: CalendarEvent): boolean {
  return event.all_day || event.status === 'cancelled' || event.self_response === 'declined';
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
    is_organizer: false, guests_can_invite_others: true, recurrence_rule: null, recurring_event_id: null,
    html_link: null, hangout_link: null, conference_data: null,
    transparency: 'opaque', visibility: 'default', color_id: null,
    reminders: null, etag: null, local_only: true,
    pending_action: null, pending_payload: null,
    created_at: '', updated_at: '',
    calendar_color: oe.personColor,
  };
}
