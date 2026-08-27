import { describe, it, expect, vi, beforeEach } from 'vitest';

// google-calendar.ts reads userDataDir at construction to locate the token file.
vi.mock('../main/paths', () => ({ userDataDir: () => '/tmp/dagaz-test' }));

const events = {
  get: vi.fn(),
  patch: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  instances: vi.fn(),
};

vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} on() {} } },
    calendar: () => ({ events }),
  },
  calendar_v3: {},
}));

import { GoogleCalendarService, isPermanentGoogleError } from '../main/google-calendar';

const CAL = 'martin@compscience.com';
const PARENT = 'parentseries';
const INSTANCE = 'parentseries_20260827T140000Z';

function makeService(): GoogleCalendarService {
  const svc = new GoogleCalendarService();
  // Bypass the OAuth flow — the calendar client is what the tests exercise.
  (svc as any).calendar = { events };
  return svc;
}

function guestInstance(organizerSelf: boolean) {
  return {
    data: {
      id: INSTANCE,
      recurringEventId: PARENT,
      organizer: { email: 'alex@compscience.com', self: organizerSelf },
      start: { dateTime: '2026-08-27T10:00:00-04:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-08-27T10:30:00-04:00', timeZone: 'America/New_York' },
    },
  };
}

function parentSeries(organizerSelf: boolean) {
  return {
    data: {
      id: PARENT,
      summary: 'Quick Weekly Sync',
      organizer: { email: organizerSelf ? CAL : 'alex@compscience.com', self: organizerSelf },
      recurrence: ['RRULE:FREQ=WEEKLY;COUNT=20'],
      start: { dateTime: '2026-07-23T10:00:00-04:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-07-23T10:30:00-04:00', timeZone: 'America/New_York' },
    },
  };
}

describe('updateEvent scope="all"', () => {
  beforeEach(() => {
    for (const fn of Object.values(events)) fn.mockReset();
  });

  it('patches the whole series instead of splitting when we are not the organizer', async () => {
    events.get
      .mockResolvedValueOnce(guestInstance(false))
      .mockResolvedValueOnce(parentSeries(false));
    events.patch.mockResolvedValue({ data: { id: PARENT, summary: 'Quick Weekly Sync' } });

    const svc = makeService();
    await svc.updateEvent(CAL, INSTANCE, { attendees: ['new@example.com'] }, 'all');

    // The duplicate-series bug: an insert here creates a second series we own.
    expect(events.insert).not.toHaveBeenCalled();
    expect(events.delete).not.toHaveBeenCalled();
    expect(events.patch).toHaveBeenCalledTimes(1);
    expect(events.patch.mock.calls[0][0]).toMatchObject({ calendarId: CAL, eventId: PARENT });
  });

  it('truncates the original series before inserting the follow-on series', async () => {
    events.get
      .mockResolvedValueOnce(guestInstance(true))
      .mockResolvedValueOnce(parentSeries(true));
    events.instances.mockResolvedValue({ data: { items: [{}, {}, {}, {}, {}] } });
    events.patch.mockResolvedValue({ data: { id: PARENT } });
    events.insert.mockResolvedValue({ data: { id: 'newseries' } });

    const svc = makeService();
    await svc.updateEvent(CAL, INSTANCE, { summary: 'Renamed' }, 'all');

    expect(events.patch).toHaveBeenCalledTimes(1);
    expect(events.insert).toHaveBeenCalledTimes(1);
    expect(events.patch.mock.invocationCallOrder[0])
      .toBeLessThan(events.insert.mock.invocationCallOrder[0]);
    expect(events.patch.mock.calls[0][0].requestBody.recurrence)
      .toEqual(['RRULE:FREQ=WEEKLY;COUNT=5']);
  });

  it('restores the original recurrence when the follow-on insert fails', async () => {
    events.get
      .mockResolvedValueOnce(guestInstance(true))
      .mockResolvedValueOnce(parentSeries(true));
    events.instances.mockResolvedValue({ data: { items: [{}, {}, {}, {}, {}] } });
    events.patch.mockResolvedValue({ data: { id: PARENT } });
    events.insert.mockRejectedValue(Object.assign(new Error('Forbidden'), { code: 403 }));

    const svc = makeService();
    await expect(svc.updateEvent(CAL, INSTANCE, { summary: 'Renamed' }, 'all')).rejects.toThrow('Forbidden');

    expect(events.patch).toHaveBeenCalledTimes(2);
    expect(events.patch.mock.calls[1][0].requestBody.recurrence)
      .toEqual(['RRULE:FREQ=WEEKLY;COUNT=20']);
  });
});

describe('isPermanentGoogleError', () => {
  it('treats a refusal as permanent and a network blip as retryable', () => {
    expect(isPermanentGoogleError(Object.assign(new Error('Forbidden'), { code: 403 }))).toBe(true);
    expect(isPermanentGoogleError({ response: { status: 404 } })).toBe(true);
    expect(isPermanentGoogleError(Object.assign(new Error('Invalid Credentials'), { code: 401 }))).toBe(false);
    expect(isPermanentGoogleError(new Error('getaddrinfo ENOTFOUND'))).toBe(false);
  });
});
