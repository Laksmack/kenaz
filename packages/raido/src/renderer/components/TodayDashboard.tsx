import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Task } from '../../shared/types';
import { extractGroup } from '../../shared/types';
import { cn, isOverdue, formatDate, getDateColor } from '../lib/utils';

interface CalendarEvent {
  id: string;
  summary: string;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  all_day: boolean;
  location: string;
  hangout_link: string | null;
  conference_data: any;
  html_link: string | null;
  attendees?: any[];
}

interface HubSpotDeal {
  id: string;
  name: string;
  stage: string;
  amount: number;
  companyName?: string;
  lastActivityDate?: string;
  createDate?: string;
}

type RecencyStatus = 'warm' | 'approaching' | 'stale';

interface ScoredDeal extends HubSpotDeal {
  daysSinceActivity: number;
  recency: RecencyStatus;
}

interface SuggestResult {
  action: string;
  rationale: string;
  source: 'task' | 'email' | 'deal' | 'calendar';
  ref_id?: string;
  timestamp: string;
}

interface TodayDashboardProps {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (task: Task) => void;
  onComplete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  suggestionPinned?: boolean;
  onToggleSuggestion?: (pinned: boolean) => void;
  hubspotEnabled?: boolean;
  hubspotPortalId?: string;
  hubspotOwnerId?: string;
  hubspotPipeline?: string;
}

function hubspotDealUrl(portalId: string, dealId: string): string {
  return `https://app.hubspot.com/contacts/${portalId}/record/0-3/${dealId}`;
}

const STALE_THRESHOLDS: Record<string, number> = {
  'Demo Scheduled': 3,
  'Demo Completed': 3,
  'Proposal Sent': 3,
  'Negotiation': 3,
  'Contract Sent': 3,
};
const DEFAULT_STALE_DAYS = 7;

function getDealRecency(deal: HubSpotDeal): { days: number; status: RecencyStatus } {
  if (!deal.lastActivityDate) return { days: 999, status: 'stale' };
  const last = new Date(deal.lastActivityDate);
  const now = new Date();
  const days = Math.floor((now.getTime() - last.getTime()) / 86400000);
  const threshold = STALE_THRESHOLDS[deal.stage] ?? DEFAULT_STALE_DAYS;
  const approachThreshold = Math.max(1, threshold - 2);

  let status: RecencyStatus = 'warm';
  if (days >= threshold) status = 'stale';
  else if (days >= approachThreshold) status = 'approaching';
  return { days, status };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function isWithinMinutes(iso: string, minutes: number): boolean {
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  return diff > 0 && diff <= minutes * 60 * 1000;
}

function getMeetingLink(event: CalendarEvent): string | null {
  if (event.hangout_link) return event.hangout_link;
  if (event.conference_data?.entryPoints) {
    const video = event.conference_data.entryPoints.find((ep: any) => ep.entryPointType === 'video');
    if (video?.uri) return video.uri;
  }
  return null;
}

export function TodayDashboard({
  tasks,
  selectedId,
  onSelect,
  onComplete,
  onUpdate,
  suggestionPinned = false,
  onToggleSuggestion,
  hubspotEnabled = false,
  hubspotPortalId = '',
  hubspotOwnerId = '',
  hubspotPipeline = '',
}: TodayDashboardProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState(false);

  const [deals, setDeals] = useState<ScoredDeal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState(false);

  const [suggestion, setSuggestion] = useState<SuggestResult | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  const fetchEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError(false);
    try {
      const data = await window.raido.crossAppFetch('http://localhost:3143/api/today');
      const sorted = (data.events || []).sort((a: CalendarEvent, b: CalendarEvent) => {
        if (a.all_day && !b.all_day) return -1;
        if (!a.all_day && b.all_day) return 1;
        return (a.start_time || '').localeCompare(b.start_time || '');
      });
      setEvents(sorted);
    } catch {
      setEventsError(true);
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const fetchDeals = useCallback(async () => {
    if (!hubspotEnabled) {
      setDealsLoading(false);
      return;
    }
    setDealsLoading(true);
    setDealsError(false);
    try {
      const params = new URLSearchParams();
      if (hubspotOwnerId) params.set('owner', hubspotOwnerId);
      if (hubspotPipeline) params.set('pipeline', hubspotPipeline);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const data = await window.raido.crossAppFetch(`http://localhost:3141/api/hubspot/deals${qs}`);
      const scored: ScoredDeal[] = (data.deals || []).map((d: HubSpotDeal) => {
        const { days, status } = getDealRecency(d);
        return { ...d, daysSinceActivity: days, recency: status };
      });
      scored.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
      setDeals(scored.slice(0, 5));
    } catch {
      setDealsError(true);
      setDeals([]);
    } finally {
      setDealsLoading(false);
    }
  }, [hubspotEnabled, hubspotOwnerId, hubspotPipeline]);

  const fetchSuggestion = useCallback(async () => {
    setSuggestionLoading(true);
    try {
      const data = await window.raido.crossAppFetch('http://localhost:3142/api/suggest-next');
      setSuggestion({ ...data, timestamp: new Date().toISOString() });
    } catch {
      setSuggestion(null);
    } finally {
      setSuggestionLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    fetchDeals();
  }, [fetchEvents, fetchDeals]);

  useEffect(() => {
    if (suggestionPinned) fetchSuggestion();
  }, [suggestionPinned, fetchSuggestion]);

  const { overdueTasks, todayTasks } = useMemo(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const overdue: Task[] = [];
    const scheduled: Task[] = [];
    for (const t of tasks) {
      if (t.due_date && t.due_date < todayStr) overdue.push(t);
      else scheduled.push(t);
    }
    return { overdueTasks: overdue, todayTasks: scheduled };
  }, [tasks]);

  const recencyColor = (status: RecencyStatus) => {
    switch (status) {
      case 'warm': return '#4ade80';
      case 'approaching': return '#f59e0b';
      case 'stale': return '#ef4444';
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide">
      {/* ── Zone A: Today's Timeline ────────────────────────── */}
      <div className="flex-shrink-0 border-b border-border-subtle">
        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Timeline</span>
          <button
            onClick={fetchEvents}
            className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors"
            title="Refresh calendar"
          >
            <svg className={cn('w-3 h-3', eventsLoading && 'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <div className="px-4 pb-3 space-y-1">
          {eventsLoading && events.length === 0 ? (
            <div className="text-xs text-text-muted py-2">Loading calendar...</div>
          ) : eventsError ? (
            <div className="text-xs text-text-muted py-2">Dagaz unavailable</div>
          ) : events.length === 0 ? (
            <div className="text-xs text-text-muted py-2">No meetings today</div>
          ) : (
            events.map((event) => {
              const meetingLink = getMeetingLink(event);
              const isSoon = event.start_time ? isWithinMinutes(event.start_time, 60) : false;
              return (
                <div
                  key={event.id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer hover:bg-bg-hover text-sm',
                    isSoon && 'ring-1 ring-inset'
                  )}
                  style={isSoon ? { ringColor: '#f59e0b', background: 'rgba(245, 158, 11, 0.05)' } : undefined}
                  onClick={async () => {
                    if (meetingLink) {
                      await navigator.clipboard.writeText(meetingLink);
                    } else {
                      try {
                        await window.raido.crossAppFetch('http://localhost:3143/api/navigate', {
                          method: 'POST',
                          body: JSON.stringify({ action: 'focus-event', eventId: event.id }),
                        });
                      } catch { /* Dagaz not available */ }
                    }
                  }}
                  title={meetingLink ? 'Click to copy meeting link' : 'Click to open in Dagaz'}
                >
                  <span className="text-xs text-text-muted tabular-nums w-24 flex-shrink-0">
                    {event.all_day ? 'All day' : event.start_time && event.end_time
                      ? `${formatTime(event.start_time)} – ${formatTime(event.end_time)}`
                      : ''}
                  </span>
                  <span className="flex-1 truncate text-text-primary">{event.summary}</span>
                  {event.location && (
                    <span className="text-[10px] text-text-muted truncate max-w-[120px]">{event.location.split('\n')[0]}</span>
                  )}
                  {meetingLink && (
                    <svg className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                  {isSoon && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)' }}>Soon</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Zone B: Tasks ───────────────────────────────────── */}
      <div className="flex-1 min-h-0 border-b border-border-subtle">
        <div className="px-4 pt-3 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Tasks</span>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100% - 2rem)' }}>
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-text-muted">
              <div className="text-3xl mb-2">✨</div>
              <div className="text-sm">No tasks for today</div>
            </div>
          ) : (
            <>
              {overdueTasks.length > 0 && (
                <div>
                  <div className="px-4 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-urgency)' }}>
                      Due Today / Overdue
                    </span>
                  </div>
                  {overdueTasks.map((task) => (
                    <TaskRow key={task.id} task={task} selected={selectedId === task.id} onSelect={onSelect} onComplete={onComplete} />
                  ))}
                </div>
              )}
              {todayTasks.length > 0 && (
                <div>
                  {overdueTasks.length > 0 && (
                    <div className="px-4 py-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Scheduled for Today</span>
                    </div>
                  )}
                  {todayTasks.map((task) => (
                    <TaskRow key={task.id} task={task} selected={selectedId === task.id} onSelect={onSelect} onComplete={onComplete} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Suggestion Card (optional) ──────────────────────── */}
      {suggestionPinned && (
        <div className="flex-shrink-0 border-b border-border-subtle">
          <div className="px-4 py-3">
            <div className="rounded-md border-l-2 px-3 py-2" style={{ borderColor: '#f59e0b' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {suggestionLoading ? (
                    <span className="text-xs text-text-muted">Thinking...</span>
                  ) : suggestion ? (
                    <>
                      <div className="text-sm font-semibold text-text-primary">{suggestion.action}</div>
                      <div className="text-xs text-text-muted mt-1">{suggestion.rationale}</div>
                      {suggestion.timestamp && (
                        <div className="text-[9px] text-text-muted mt-1.5">
                          {new Date(suggestion.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-text-muted">No suggestion available</span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {suggestion?.source && (
                    <span className="tag-pill text-[9px]">{suggestion.source}</span>
                  )}
                  <button
                    onClick={fetchSuggestion}
                    className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors"
                    title="Refresh suggestion"
                  >
                    <svg className={cn('w-3 h-3', suggestionLoading && 'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onToggleSuggestion?.(false)}
                    className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors"
                    title="Hide suggestion"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Zone C: HubSpot Pulse ───────────────────────────── */}
      {hubspotEnabled && <div className="flex-shrink-0">
        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Deal Pulse</span>
          <button
            onClick={fetchDeals}
            className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors"
            title="Refresh deals"
          >
            <svg className={cn('w-3 h-3', dealsLoading && 'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <div className="px-4 pb-3 space-y-1">
          {dealsLoading && deals.length === 0 ? (
            <div className="text-xs text-text-muted py-2">Loading deals...</div>
          ) : dealsError ? (
            <div className="text-xs text-text-muted py-2">HubSpot unavailable</div>
          ) : deals.length === 0 ? (
            <div className="text-xs text-text-muted py-2">No active deals</div>
          ) : (
            deals.map((deal) => (
              <a
                key={deal.id}
                href={hubspotPortalId ? hubspotDealUrl(hubspotPortalId, deal.id) : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-bg-hover transition-colors cursor-pointer text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-text-primary truncate">{deal.name}</div>
                  {deal.companyName && <div className="text-[10px] text-text-muted truncate">{deal.companyName}</div>}
                </div>
                <span className="tag-pill text-[9px] flex-shrink-0">{deal.stage}</span>
                <span
                  className="text-xs tabular-nums font-medium flex-shrink-0"
                  style={{ color: recencyColor(deal.recency) }}
                  title={deal.lastActivityDate ? `Last activity: ${new Date(deal.lastActivityDate).toLocaleDateString()}` : 'No activity recorded'}
                >
                  {deal.daysSinceActivity < 999 ? `${deal.daysSinceActivity}d` : '—'}
                </span>
                {deal.amount > 0 && (
                  <span className="text-xs text-text-muted tabular-nums flex-shrink-0">
                    ${deal.amount >= 1000 ? `${(deal.amount / 1000).toFixed(0)}k` : deal.amount}
                  </span>
                )}
              </a>
            ))
          )}
        </div>
      </div>}
    </div>
  );
}

function TaskRow({ task, selected, onSelect, onComplete }: {
  task: Task;
  selected: boolean;
  onSelect: (task: Task) => void;
  onComplete: (id: string) => void;
}) {
  const group = extractGroup(task.title);
  const { color, bold } = getDateColor(task.due_date);

  return (
    <div
      onClick={() => onSelect(task)}
      className={cn(
        'task-item group/row',
        selected && 'active'
      )}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onComplete(task.id); }}
        className={cn(
          'w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 transition-colors flex items-center justify-center',
          task.status === 'completed'
            ? 'border-accent-primary bg-accent-primary/20'
            : 'border-[#3a3228] hover:border-accent-primary hover:bg-accent-primary/5'
        )}
      >
        {task.status === 'completed' && (
          <svg className="w-2.5 h-2.5 text-accent-primary" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.5 11.5L3 8l1-1 2.5 2.5 5-5 1 1-6 6z" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm truncate', task.status === 'completed' && 'line-through text-text-muted')}>
            {task.title}
          </span>
          {group && (
            <span className="tag-pill text-[9px] flex-shrink-0">{group}</span>
          )}
        </div>
      </div>

      {task.recurrence && (
        <span className="text-[10px] text-text-muted flex-shrink-0" title={`Repeats ${task.recurrence}`}>🔁</span>
      )}

      {task.due_date && (
        <span
          className="text-xs flex-shrink-0 ml-2 tabular-nums"
          style={{ color, fontWeight: bold ? 700 : 400 }}
        >
          {formatDate(task.due_date)}
        </span>
      )}
    </div>
  );
}
