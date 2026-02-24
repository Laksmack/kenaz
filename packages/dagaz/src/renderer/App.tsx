import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { WeekView } from './components/WeekView';
import { DayView } from './components/DayView';
import { MonthView } from './components/MonthView';
import { EventBlock } from './components/EventBlock';
import { EventDetail } from './components/EventDetail';
import { InviteReviewPanel } from './components/InviteReviewPanel';
import { QuickCreate } from './components/QuickCreate';
import { SettingsModal } from './components/SettingsModal';
import { AuthScreen } from './components/AuthScreen';
import { useCalendar, useSync } from './hooks/useCalendar';
import { usePendingInvites } from './hooks/usePendingInvites';
import { useNeedsAction } from './hooks/useNeedsAction';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { UpdateBanner } from '@futhark/core/components/UpdateBanner';
import { isSameDay, formatDayHeader, dateKey, setUse24HourClock } from './lib/utils';
import type { ViewType, CalendarEvent, AppConfig, CreateEventInput, OverlayPerson, OverlayEvent } from '../shared/types';
import { OVERLAY_COLORS } from '../shared/types';
import { PeopleOverlay } from './components/PeopleOverlay';

export default function App() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateStart, setQuickCreateStart] = useState<Date | undefined>();
  const [quickCreateEnd, setQuickCreateEnd] = useState<Date | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [overlayPeople, setOverlayPeople] = useState<OverlayPerson[]>([]);
  const [overlayEvents, setOverlayEvents] = useState<OverlayEvent[]>([]);
  const [showInvitesPanel, setShowInvitesPanel] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, durationMs = 3000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  const weekDays = appConfig?.weekViewDays || 5;
  const { events: rawEvents, calendars, loading, refresh, fetchCalendars } = useCalendar(currentView, currentDate, weekDays as 5 | 7);
  const syncState = useSync();
  const {
    invites: pendingInvites,
    isLoading: pendingInvitesLoading,
    refresh: refreshPendingInvites,
    dismissInvite: dismissPendingInvite,
  } = usePendingInvites(appConfig?.pendingInviteCheckInterval);
  const {
    events: needsActionEvents,
    isLoading: needsActionLoading,
    refresh: refreshNeedsAction,
  } = useNeedsAction();

  // Filter out declined events when setting is enabled
  const events = useMemo(() => {
    if (!appConfig?.hideDeclinedEvents) return rawEvents;
    return rawEvents.filter(e => e.self_response !== 'declined');
  }, [rawEvents, appConfig?.hideDeclinedEvents]);

  // Check auth on mount
  useEffect(() => {
    window.dagaz.getAuthStatus().then(setIsAuthed).catch(() => setIsAuthed(false));
    window.dagaz.getConfig().then(c => {
      setAppConfig(c);
      setUse24HourClock(c.use24HourClock);
      if (c.overlayPeople?.length) setOverlayPeople(c.overlayPeople);
    });
  }, []);

  // Apply theme
  useEffect(() => {
    const themePref = appConfig?.theme || 'dark';
    const apply = (resolved: 'dark' | 'light') => {
      document.documentElement.dataset.theme = resolved;
    };
    if (themePref === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mq.matches ? 'dark' : 'light');
      const handler = (e: MediaQueryListEvent) => apply(e.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      apply(themePref);
    }
  }, [appConfig?.theme]);

  // Today's events for sidebar — fetched independently so they persist across view changes
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const fetchTodayEvents = useCallback(async () => {
    try {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
      const evts = await window.dagaz.getEvents(start, end);
      const filtered = (evts || []).filter((e: CalendarEvent) => !e.all_day);
      setTodayEvents(filtered);
    } catch { /* silent */ }
  }, []);

  // Fetch today's events on mount, on sync, and when the visible events change
  useEffect(() => { fetchTodayEvents(); }, [fetchTodayEvents]);
  useEffect(() => {
    const unsub = window.dagaz.onSyncChanged(() => fetchTodayEvents());
    return unsub;
  }, [fetchTodayEvents]);
  // Also refresh when events change (covers drag/create/delete)
  useEffect(() => { fetchTodayEvents(); }, [rawEvents, fetchTodayEvents]);

  // ── Navigation ────────────────────────────────────────────

  const navigateNext = useCallback(() => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      switch (currentView) {
        case 'day': d.setDate(d.getDate() + 1); break;
        case 'week': d.setDate(d.getDate() + 7); break;
        case 'month': d.setMonth(d.getMonth() + 1); break;
        case 'agenda': d.setDate(d.getDate() + 7); break;
      }
      return d;
    });
    setSelectedEvent(null);
  }, [currentView]);

  const navigatePrev = useCallback(() => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      switch (currentView) {
        case 'day': d.setDate(d.getDate() - 1); break;
        case 'week': d.setDate(d.getDate() - 7); break;
        case 'month': d.setMonth(d.getMonth() - 1); break;
        case 'agenda': d.setDate(d.getDate() - 7); break;
      }
      return d;
    });
    setSelectedEvent(null);
  }, [currentView]);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
    setSelectedEvent(null);
  }, []);

  // ── Event Actions ─────────────────────────────────────────

  const handleCreateEvent = useCallback(async (data: CreateEventInput) => {
    await window.dagaz.createEvent(data);
    refresh({ full: false });
  }, [refresh]);

  const handleUpdateEvent = useCallback(async (event: CalendarEvent, newStart: Date, newEnd: Date) => {
    // Recurring event: ask whether to edit this instance or the series
    if (event.recurring_event_id) {
      const choice = window.confirm(
        `"${event.summary}" is a recurring event.\n\nOK = Change only this event\nCancel = Don't change`
      );
      if (!choice) return;
      // Editing a single instance: use the instance ID (event.id), which Google handles correctly
    }

    // Permission check for events you don't organize
    const hasOtherAttendees = (event.attendees?.length ?? 0) > 1;
    const canEditDirectly = event.is_organizer || !hasOtherAttendees;

    if (!canEditDirectly) {
      const ok = window.confirm(
        `You are not the organizer of "${event.summary}".\n\nPropose a new time? This will update the event and notify the organizer.`
      );
      if (!ok) return;
    }

    const updates = {
      start: newStart.toISOString(),
      end: newEnd.toISOString(),
    };
    await window.dagaz.updateEvent(event.id, updates);

    // Show toast
    if (hasOtherAttendees) {
      showToast(`"${event.summary}" updated — invitations sent to ${(event.attendees?.length ?? 1) - 1} attendee${(event.attendees?.length ?? 2) > 2 ? 's' : ''}`);
    } else {
      showToast(`"${event.summary}" moved`);
    }

    refresh({ full: false });
    if (selectedEvent?.id === event.id) {
      const updated = await window.dagaz.getEvent(event.id);
      if (updated) setSelectedEvent(updated);
    }
  }, [refresh, selectedEvent, showToast]);

  const handleDeleteEvent = useCallback(async (id: string) => {
    // Find the event to check if it's recurring
    const event = rawEvents.find(e => e.id === id) || selectedEvent;
    if (event?.recurring_event_id) {
      const ok = window.confirm(
        `"${event.summary}" is a recurring event.\n\nOK = Delete only this event\nCancel = Don't delete`
      );
      if (!ok) return;
    }
    await window.dagaz.deleteEvent(id);
    setSelectedEvent(prev => prev?.id === id ? null : prev);
    showToast(event ? `"${event.summary}" deleted` : 'Event deleted');
    refresh({ full: false });
  }, [refresh, rawEvents, selectedEvent, showToast]);

  const handleRSVP = useCallback(async (id: string, response: 'accepted' | 'declined' | 'tentative') => {
    await window.dagaz.rsvpEvent(id, response);
    refresh({ full: false });
    refreshNeedsAction();
    const updated = await window.dagaz.getEvent(id);
    if (updated) setSelectedEvent(updated);

    // Archive the matching invite email in Kenaz
    if (updated?.summary) {
      const match = pendingInvites.find(inv => inv.title === updated.summary);
      if (match) {
        try {
          await window.dagaz.rsvpInvite(match.threadId, 'done');
          dismissPendingInvite(match.threadId);
          refreshPendingInvites();
        } catch {}
      }
    }
  }, [refresh, refreshNeedsAction, pendingInvites, dismissPendingInvite, refreshPendingInvites]);

  const handleInviteRsvp = useCallback(async (invite: { threadId: string; title: string; startTime: string | null }, response: 'accepted' | 'declined' | 'tentative') => {
    // Find matching calendar event to RSVP on
    const match = events.find(e =>
      e.summary === invite.title ||
      (invite.startTime && e.start_time === invite.startTime),
    );
    if (match) {
      await window.dagaz.rsvpEvent(match.id, response);
      refresh({ full: false });
    }
    // Archive in Kenaz
    await window.dagaz.rsvpInvite(invite.threadId, 'done');
    refreshPendingInvites();
    refreshNeedsAction();
  }, [events, refresh, refreshPendingInvites, refreshNeedsAction]);

  const handleCalendarToggle = useCallback(async (id: string, visible: boolean) => {
    await window.dagaz.updateCalendar(id, { visible });
    fetchCalendars();
    refresh({ full: false });
  }, [fetchCalendars, refresh]);

  const selectEvent = useCallback((event: CalendarEvent | null) => {
    setSelectedEvent(event);
    if (event) setShowInvitesPanel(false);
  }, []);

  const openQuickCreate = useCallback((start?: Date, end?: Date) => {
    setQuickCreateStart(start);
    setQuickCreateEnd(end);
    setQuickCreateOpen(true);
  }, []);

  const handleAuth = useCallback(async () => {
    const result = await window.dagaz.startAuth();
    if (result.success) {
      setIsAuthed(true);
    } else {
      throw new Error(result.error || 'Authentication failed');
    }
  }, []);

  // ── Overlay People ───────────────────────────────────────
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

    // Calculate visible date range based on current view
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
      end.setDate(start.getDate() + (weekDays));
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

  const handleDateSelect = useCallback((date: Date) => {
    setCurrentDate(date);
    if (currentView === 'month') {
      setCurrentView('day');
    }
  }, [currentView]);

  const handleJoinMeeting = useCallback(() => {
    if (!selectedEvent) return;
    const link = selectedEvent.conference_data?.entryPoints?.find(
      ep => ep.entryPointType === 'video'
    )?.uri || selectedEvent.hangout_link;
    if (link) window.dagaz.openExternal(link);
  }, [selectedEvent]);

  // ── Keyboard Shortcuts ────────────────────────────────────

  useKeyboardShortcuts({
    onViewChange: (v) => { setCurrentView(v); setSelectedEvent(null); },
    onNavigateNext: navigateNext,
    onNavigatePrev: navigatePrev,
    onGoToToday: goToToday,
    onQuickCreate: () => openQuickCreate(),
    onEditEvent: () => { /* TODO: open edit mode */ },
    onDeleteEvent: () => { if (selectedEvent) handleDeleteEvent(selectedEvent.id); },
    onOpenDetail: () => { /* Detail auto-opens on select */ },
    onClosePanel: () => {
      if (showHelp) { setShowHelp(false); return; }
      if (settingsOpen) { setSettingsOpen(false); return; }
      if (quickCreateOpen) { setQuickCreateOpen(false); return; }
      setSelectedEvent(null);
    },
    onSearch: () => { /* TODO */ },
    onGoToDate: () => { /* TODO */ },
    onDuplicate: () => { /* TODO */ },
    onRSVP: () => { /* TODO: show RSVP menu */ },
    onJoinMeeting: handleJoinMeeting,
    onShowHelp: () => setShowHelp(prev => !prev),
    onToggleWeekDays: () => {
      if (appConfig) {
        const newDays = appConfig.weekViewDays === 5 ? 7 : 5;
        window.dagaz.setConfig({ weekViewDays: newDays });
        setAppConfig(prev => prev ? { ...prev, weekViewDays: newDays } : prev);
      }
    },
    onSettings: () => setSettingsOpen(prev => !prev),
    selectedEvent,
    currentView,
  });

  // ── Loading / Auth Check ──────────────────────────────────

  if (isAuthed === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-primary">
        <div className="animate-pulse text-text-muted text-sm">Loading...</div>
      </div>
    );
  }

  if (!isAuthed) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  // ── Header Label ──────────────────────────────────────────

  const headerLabel = (() => {
    switch (currentView) {
      case 'day':
        return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      case 'week': {
        const d = new Date(currentDate);
        const dayOfWeek = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
        const endDay = new Date(monday);
        endDay.setDate(monday.getDate() + (weekDays - 1));
        if (monday.getMonth() === endDay.getMonth()) {
          return `${monday.toLocaleDateString('en-US', { month: 'long' })} ${monday.getDate()}–${endDay.getDate()}, ${monday.getFullYear()}`;
        }
        return `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      }
      case 'month':
        return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      case 'agenda':
        return 'Agenda';
      default:
        return '';
    }
  })();

  // ── Agenda View ───────────────────────────────────────────

  const renderAgendaView = () => {
    const grouped = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const start = new Date(event.all_day ? (event.start_date || event.start_time) : event.start_time);
      const key = dateKey(start);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(event);
    }

    const sortedDays = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));

    return (
      <div className="h-full overflow-y-auto scrollbar-thin p-4 space-y-4">
        {sortedDays.length === 0 && !loading && (
          <p className="text-sm text-text-muted text-center mt-8">No events in this period</p>
        )}
        {sortedDays.map(([dayKey, dayEvents]) => (
          <div key={dayKey}>
            <h3 className="text-xs font-medium text-text-muted mb-2 uppercase tracking-wider">
              {formatDayHeader(new Date(dayKey + 'T00:00:00'))}
            </h3>
            <div className="space-y-1">
              {dayEvents.map(event => (
                <EventBlock
                  key={event.id}
                  event={event}
                  selected={selectedEvent?.id === event.id}
                  onClick={setSelectedEvent}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── Main Render ───────────────────────────────────────────

  return (
    <div className="h-screen flex bg-bg-primary">
      {/* Sidebar */}
      <div className="w-56 min-w-[200px] border-r border-border-subtle flex-shrink-0 titlebar-drag">
        <div className="titlebar-no-drag h-full">
          <Sidebar
            calendars={calendars}
            currentDate={currentDate}
            onDateSelect={handleDateSelect}
            onCalendarToggle={handleCalendarToggle}
            todayEvents={todayEvents}
            currentView={currentView}
            onViewChange={setCurrentView}
            pendingInvites={pendingInvites}
            pendingInvitesLoading={pendingInvitesLoading}
            onRefreshInvites={refreshPendingInvites}
            onDismissInvite={dismissPendingInvite}
            onRsvpInvite={handleInviteRsvp}
          >
            <PeopleOverlay
              people={overlayPeople}
              onAdd={addOverlayPerson}
              onRemove={removeOverlayPerson}
              onToggle={toggleOverlayPerson}
            />
          </Sidebar>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <UpdateBanner api={window.dagaz} />
        {/* Title bar */}
        <div className="titlebar-drag h-12 flex items-center px-4 bg-bg-secondary border-b border-border-subtle flex-shrink-0">
          {/* Navigation */}
          <div className="titlebar-no-drag flex items-center gap-1">
            <button onClick={navigatePrev} className="p-1.5 rounded hover:bg-bg-hover text-text-secondary">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goToToday}
              className="px-2.5 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
            >
              Today
            </button>
            <button onClick={navigateNext} className="p-1.5 rounded hover:bg-bg-hover text-text-secondary">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Date label */}
          <div className="ml-3 text-sm font-medium text-text-primary">{headerLabel}</div>

          <div className="flex-1" />

          {/* View tabs */}
          <div className="titlebar-no-drag flex items-center gap-1 mr-3">
            {needsActionEvents.length > 0 && (
              <button
                onClick={() => { setShowInvitesPanel(true); setSelectedEvent(null); }}
                className={`view-tab flex items-center gap-1.5 ${showInvitesPanel && !selectedEvent ? 'active' : ''}`}
                title="Events needing your response"
              >
                Pending
                <span className="px-1.5 py-0.5 rounded-full bg-accent-primary/20 text-accent-primary text-[10px] font-semibold leading-none">
                  {needsActionEvents.length}
                </span>
              </button>
            )}
            {([
              { key: 'day' as const, label: 'Day', shortcut: 'D' },
              { key: 'week' as const, label: 'Week', shortcut: 'W' },
              { key: 'month' as const, label: 'Month', shortcut: 'M' },
              { key: 'agenda' as const, label: 'Agenda', shortcut: 'A' },
            ]).map(v => (
              <button
                key={v.key}
                onClick={() => { setCurrentView(v.key); setSelectedEvent(null); setShowInvitesPanel(false); }}
                className={`view-tab ${currentView === v.key && !showInvitesPanel ? 'active' : ''}`}
                title={`${v.label} (${v.shortcut})`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Toolbar buttons */}
          <div className="titlebar-no-drag flex items-center gap-1.5">
            {syncState.status === 'offline' && (
              <span className="text-[10px] text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded">Offline</span>
            )}
            {syncState.pendingCount > 0 && (
              <span className="text-[10px] text-accent-warm bg-accent-warm/10 px-1.5 py-0.5 rounded">
                {syncState.pendingCount} pending
              </span>
            )}

            <button
              onClick={() => refresh({ full: true })}
              disabled={loading || syncState.status === 'syncing'}
              className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
              title="Refresh (sync & reload)"
            >
              <svg className={`w-4 h-4 ${loading || syncState.status === 'syncing' ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
              title="Settings (Cmd+,)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>

          {/* Dagaz rune — far right, click to create event */}
          <div className="titlebar-no-drag ml-3 flex items-center">
            <button
              onClick={() => openQuickCreate()}
              className="p-0.5 rounded-md hover:opacity-80 transition-opacity"
              title="New Event (C)"
            >
              <svg className="w-5 h-5" viewBox="0 0 512 512" fill="none">
                <defs>
                  <linearGradient id="dagaz-title" x1="51.2" y1="460.8" x2="460.8" y2="51.2" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#2D5F8A"/>
                    <stop offset="1" stopColor="#7AB8D4"/>
                  </linearGradient>
                </defs>
                <rect x="25.6" y="25.6" width="460.8" height="460.8" rx="102.4" fill="url(#dagaz-title)"/>
                <path d="M128 160L256 256L128 352M384 160L256 256L384 352" stroke="#FFF8F0" strokeWidth="31.36" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <line x1="128" y1="160" x2="128" y2="352" stroke="#FFF8F0" strokeWidth="31.36" strokeLinecap="round"/>
                <line x1="384" y1="160" x2="384" y2="352" stroke="#FFF8F0" strokeWidth="31.36" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Calendar view */}
          <div className="flex-1 min-w-0">
            {currentView === 'week' && (
              <WeekView
                currentDate={currentDate}
                events={events}
                overlayEvents={overlayEvents}
                pendingInvites={pendingInvites}
                selectedEvent={selectedEvent}
                onSelectEvent={selectEvent}
                onCreateEvent={(start, end) => openQuickCreate(start, end)}
                onUpdateEvent={handleUpdateEvent}
                onRSVP={handleRSVP}
                weekDays={weekDays as 5 | 7}
                defaultEventDurationMinutes={appConfig?.defaultEventDurationMinutes}
              />
            )}
            {currentView === 'day' && (
              <DayView
                currentDate={currentDate}
                events={events}
                overlayEvents={overlayEvents}
                pendingInvites={pendingInvites}
                selectedEvent={selectedEvent}
                onSelectEvent={selectEvent}
                onCreateEvent={(start, end) => openQuickCreate(start, end)}
                onUpdateEvent={handleUpdateEvent}
                onRSVP={handleRSVP}
                defaultEventDurationMinutes={appConfig?.defaultEventDurationMinutes}
              />
            )}
            {currentView === 'month' && (
              <MonthView
                currentDate={currentDate}
                events={events}
                selectedEvent={selectedEvent}
                onSelectEvent={selectEvent}
                onDateSelect={handleDateSelect}
              />
            )}
            {currentView === 'agenda' && renderAgendaView()}
          </div>

          {/* Right panel: event detail or needs-action review */}
          {selectedEvent ? (
            <EventDetail
              event={selectedEvent}
              onClose={() => { setSelectedEvent(null); if (needsActionEvents.length > 0) setShowInvitesPanel(true); }}
              onDelete={handleDeleteEvent}
              onRSVP={handleRSVP}
              onEdit={() => { /* TODO */ }}
            />
          ) : (showInvitesPanel || needsActionEvents.length > 0) && (
            <InviteReviewPanel
              events={needsActionEvents}
              allEvents={events}
              isLoading={needsActionLoading}
              onRefresh={refreshNeedsAction}
              onRsvp={handleRSVP}
              onSelectEvent={selectEvent}
              onDateSelect={handleDateSelect}
            />
          )}
        </div>
      </div>

      {/* Quick Create Modal */}
      <QuickCreate
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        onCreate={handleCreateEvent}
        calendars={calendars}
        defaultCalendarId={appConfig?.defaultCalendarId || null}
        defaultStart={quickCreateStart}
        defaultEnd={quickCreateEnd}
        defaultAttendees={overlayPeople}
      />

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}

      {/* Keyboard Shortcut Help */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowHelp(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-bg-secondary border border-border-subtle rounded-xl shadow-2xl p-6 w-[420px] animate-slide-up" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-text-primary mb-4">Keyboard Shortcuts</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              {[
                ['T', 'Jump to today'],
                ['D', 'Day view'],
                ['W', '5-day work week'],
                ['Shift+W', 'Full 7-day week'],
                ['M', 'Month view'],
                ['A', 'Agenda view'],
                ['C', 'Quick create event'],
                ['E', 'Edit selected event'],
                ['Delete', 'Delete selected event'],
                ['Enter', 'Open event detail'],
                ['Esc', 'Close panel / deselect'],
                ['N', 'Next period'],
                ['P', 'Previous period'],
                ['G', 'Go to date'],
                ['/', 'Search events'],
                ['Cmd+D', 'Duplicate event'],
                ['R', 'RSVP menu'],
                ['J', 'Join meeting'],
                ['?', 'This help'],
              ].map(([key, desc]) => (
                <React.Fragment key={key}>
                  <div className="flex items-center gap-2">
                    <span className="shortcut-key">{key}</span>
                    <span className="text-text-secondary">{desc}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
          <div className="bg-bg-tertiary border border-border-subtle text-text-primary text-xs px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-accent-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
