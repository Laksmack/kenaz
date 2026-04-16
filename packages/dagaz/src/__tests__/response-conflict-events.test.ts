import { describe, expect, it } from 'vitest';
import { buildConflictRanges, mergeConflictEvents } from '../renderer/lib/response-conflict-events';
import type { CalendarEvent, PendingInvite } from '../shared/types';

function event(id: string, start: string, end: string): CalendarEvent {
  return {
    id,
    google_id: id,
    calendar_id: 'primary',
    summary: id,
    description: '',
    location: '',
    start_time: start,
    end_time: end,
    start_date: null,
    end_date: null,
    all_day: false,
    time_zone: null,
    status: 'confirmed',
    self_response: null,
    organizer_email: null,
    organizer_name: null,
    is_organizer: false,
    guests_can_invite_others: true,
    recurrence_rule: null,
    recurring_event_id: null,
    html_link: null,
    hangout_link: null,
    conference_data: null,
    transparency: 'opaque',
    visibility: 'default',
    color_id: null,
    reminders: null,
    etag: null,
    local_only: false,
    pending_action: null,
    pending_payload: null,
    created_at: '',
    updated_at: '',
  };
}

function invite(startTime: string, endTime: string): PendingInvite {
  return {
    threadId: 'thread-1',
    subject: 'invite',
    title: 'invite',
    organizer: 'Organizer',
    organizerEmail: 'org@example.com',
    startTime,
    endTime,
    iCalUID: null,
  };
}

describe('response conflict helpers', () => {
  it('builds merged ranges and applies buffer', () => {
    const needsAction = [event('na1', '2026-03-27T08:00:00.000Z', '2026-03-27T08:30:00.000Z')];
    const pending = [invite('2026-03-27T08:10:00.000Z', '2026-03-27T08:45:00.000Z')];
    const ranges = buildConflictRanges(needsAction, pending, 60_000);

    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({
      start: new Date('2026-03-27T07:59:00.000Z').getTime(),
      end: new Date('2026-03-27T08:46:00.000Z').getTime(),
    });
  });

  it('keeps base events even when fetched batches are incomplete', () => {
    const base = [
      event('existing-overlap', '2026-03-27T08:00:00.000Z', '2026-03-27T08:30:00.000Z'),
      event('other', '2026-03-27T09:00:00.000Z', '2026-03-27T09:30:00.000Z'),
    ];
    const fetched = [[event('fetched-new', '2026-03-27T10:00:00.000Z', '2026-03-27T10:30:00.000Z')]];
    const merged = mergeConflictEvents(base, fetched);

    expect(merged.map((e) => e.id).sort()).toEqual(['existing-overlap', 'fetched-new', 'other']);
  });
});
