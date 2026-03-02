import '@testing-library/jest-dom/vitest';

// Mock window.dagaz for renderer tests
Object.defineProperty(window, 'dagaz', {
  value: {
    getAuthStatus: vi.fn().mockResolvedValue(true),
    getConfig: vi.fn().mockResolvedValue({}),
    setConfig: vi.fn().mockResolvedValue(undefined),
    getEvents: vi.fn().mockResolvedValue([]),
    getEvent: vi.fn().mockResolvedValue(null),
    getCalendars: vi.fn().mockResolvedValue([]),
    createEvent: vi.fn().mockResolvedValue({}),
    updateEvent: vi.fn().mockResolvedValue({}),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    rsvpEvent: vi.fn().mockResolvedValue(undefined),
    triggerSync: vi.fn().mockResolvedValue(undefined),
    getSyncStatus: vi.fn().mockResolvedValue({ status: 'synced', lastSync: null, pendingCount: 0 }),
    clearSyncQueue: vi.fn().mockResolvedValue(undefined),
    onSyncChanged: vi.fn().mockReturnValue(() => {}),
    onEventsChanged: vi.fn().mockReturnValue(() => {}),
    onConnectivityChanged: vi.fn().mockReturnValue(() => {}),
    startAuth: vi.fn().mockResolvedValue({ success: true }),
    openExternal: vi.fn(),
    updateCalendar: vi.fn().mockResolvedValue(undefined),
    fetchOverlayEvents: vi.fn().mockResolvedValue({ success: true, events: [] }),
    rsvpInvite: vi.fn().mockResolvedValue(undefined),
    getPendingInvites: vi.fn().mockResolvedValue([]),
    getNeedsActionEvents: vi.fn().mockResolvedValue([]),
  },
  writable: true,
});
