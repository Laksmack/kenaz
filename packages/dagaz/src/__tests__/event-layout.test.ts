import { describe, it, expect } from 'vitest';
import { getMinutesFromTime, timeOverlaps, computeLayouts, HOUR_HEIGHT, HOURS } from '../renderer/lib/event-layout';
import type { LayoutItem } from '../renderer/lib/event-layout';

describe('HOUR_HEIGHT & HOURS constants', () => {
  it('HOUR_HEIGHT is 60', () => {
    expect(HOUR_HEIGHT).toBe(60);
  });

  it('HOURS has 24 entries (0–23)', () => {
    expect(HOURS).toHaveLength(24);
    expect(HOURS[0]).toBe(0);
    expect(HOURS[23]).toBe(23);
  });
});

describe('getMinutesFromTime', () => {
  it('parses a standard time range', () => {
    const { start, end } = getMinutesFromTime(
      '2026-03-01T09:00:00',
      '2026-03-01T10:00:00',
    );
    expect(start).toBe(540); // 9 * 60
    expect(end).toBe(600);   // 10 * 60
  });

  it('enforces 15-minute minimum duration', () => {
    const { start, end } = getMinutesFromTime(
      '2026-03-01T09:00:00',
      '2026-03-01T09:05:00',
    );
    expect(start).toBe(540);
    expect(end).toBe(555); // 540 + 15
  });

  it('handles events crossing midnight', () => {
    const { start, end } = getMinutesFromTime(
      '2026-03-01T23:00:00',
      '2026-03-02T01:00:00',
    );
    expect(start).toBe(23 * 60); // 1380
    expect(end).toBe(24 * 60);   // 1440 — clamped to midnight
  });
});

describe('timeOverlaps', () => {
  const t = (h: number, m = 0) => `2026-03-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;

  it('detects overlapping events', () => {
    expect(timeOverlaps(t(9), t(10), t(9, 30), t(11))).toBe(true);
  });

  it('detects fully contained events', () => {
    expect(timeOverlaps(t(9), t(12), t(10), t(11))).toBe(true);
  });

  it('returns false for adjacent events', () => {
    expect(timeOverlaps(t(9), t(10), t(10), t(11))).toBe(false);
  });

  it('returns false for separated events', () => {
    expect(timeOverlaps(t(9), t(10), t(11), t(12))).toBe(false);
  });
});

describe('computeLayouts', () => {
  function item(id: string, startHour: number, endHour: number): LayoutItem {
    return {
      id,
      start_time: `2026-03-01T${String(startHour).padStart(2, '0')}:00:00`,
      end_time: `2026-03-01T${String(endHour).padStart(2, '0')}:00:00`,
      isOverlay: false,
    };
  }

  it('returns empty map for empty input', () => {
    expect(computeLayouts([])).toEqual(new Map());
  });

  it('assigns a single event to column 0 with totalColumns 1', () => {
    const layouts = computeLayouts([item('a', 9, 10)]);
    expect(layouts.get('a')).toEqual({ column: 0, totalColumns: 1 });
  });

  it('lays out non-overlapping events in column 0', () => {
    const layouts = computeLayouts([
      item('a', 9, 10),
      item('b', 11, 12),
    ]);
    expect(layouts.get('a')).toEqual({ column: 0, totalColumns: 1 });
    expect(layouts.get('b')).toEqual({ column: 0, totalColumns: 1 });
  });

  it('assigns overlapping events to separate columns', () => {
    const layouts = computeLayouts([
      item('a', 9, 11),
      item('b', 10, 12),
    ]);
    expect(layouts.get('a')?.column).toBe(0);
    expect(layouts.get('b')?.column).toBe(1);
    expect(layouts.get('a')?.totalColumns).toBe(2);
    expect(layouts.get('b')?.totalColumns).toBe(2);
  });

  it('handles three overlapping events', () => {
    const layouts = computeLayouts([
      item('a', 9, 12),
      item('b', 10, 13),
      item('c', 11, 14),
    ]);
    expect(layouts.get('a')?.totalColumns).toBe(3);
    expect(layouts.get('b')?.totalColumns).toBe(3);
    expect(layouts.get('c')?.totalColumns).toBe(3);
    // Each should be in a different column
    const cols = new Set([
      layouts.get('a')?.column,
      layouts.get('b')?.column,
      layouts.get('c')?.column,
    ]);
    expect(cols.size).toBe(3);
  });

  it('reuses columns for non-overlapping events in same cluster', () => {
    // a: 9–10, b: 9–11 (overlaps a), c: 10–11 (overlaps b but not a)
    const layouts = computeLayouts([
      item('a', 9, 10),
      item('b', 9, 11),
      item('c', 10, 11),
    ]);
    // Sort puts b first (longer event at same start), so b=col0, a=col1
    // c can reuse b's col? No — b ends at 11 and c starts at 10 (overlap).
    // c can reuse a's column since a ends at 10 and c starts at 10.
    expect(layouts.get('b')?.column).toBe(0);
    expect(layouts.get('a')?.column).toBe(1);
    expect(layouts.get('c')?.column).toBe(1); // reuses a's column
    expect(layouts.get('b')?.totalColumns).toBe(2);
  });
});
