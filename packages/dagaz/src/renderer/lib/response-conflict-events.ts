import type { CalendarEvent, PendingInvite } from '../../shared/types';

type TimeRange = { start: number; end: number };

export function buildConflictRanges(
  needsActionEvents: CalendarEvent[],
  pendingInvites: PendingInvite[],
  bufferMs: number,
): TimeRange[] {
  const ranges: TimeRange[] = [];

  for (const event of needsActionEvents) {
    const start = new Date(event.start_time).getTime();
    const end = new Date(event.end_time).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
    ranges.push({ start, end });
  }

  for (const invite of pendingInvites) {
    if (!invite.startTime || !invite.endTime) continue;
    const start = new Date(invite.startTime).getTime();
    const end = new Date(invite.endTime).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
    ranges.push({ start, end });
  }

  if (ranges.length === 0) return [];

  ranges.sort((a, b) => a.start - b.start);
  const merged: TimeRange[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) merged.push({ ...range });
    else last.end = Math.max(last.end, range.end);
  }

  return merged.map((r) => ({
    start: r.start - bufferMs,
    end: r.end + bufferMs,
  }));
}

export function mergeConflictEvents(
  baseEvents: CalendarEvent[],
  fetchedBatches: CalendarEvent[][],
): CalendarEvent[] {
  const merged = new Map<string, CalendarEvent>();
  for (const event of baseEvents) merged.set(event.id, event);
  for (const batch of fetchedBatches) {
    for (const event of batch || []) merged.set(event.id, event);
  }
  return Array.from(merged.values());
}
