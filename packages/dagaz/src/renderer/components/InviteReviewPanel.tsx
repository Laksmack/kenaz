import React, { useMemo, useState } from 'react';
import type { PendingInvite, CalendarEvent } from '../../shared/types';
import { formatTime } from '../lib/utils';

type RsvpResponse = 'accepted' | 'declined' | 'tentative';

interface Props {
  invites: PendingInvite[];
  isLoading: boolean;
  onRefresh: () => void;
  onDismiss: (threadId: string) => void;
  onRsvp: (invite: PendingInvite, response: RsvpResponse) => Promise<void>;
  confirmedEvents: CalendarEvent[];
  onDateSelect: (date: Date) => void;
}

function hasConflict(invite: PendingInvite, events: CalendarEvent[]): boolean {
  if (!invite.startTime || !invite.endTime) return false;
  const iStart = new Date(invite.startTime).getTime();
  const iEnd = new Date(invite.endTime).getTime();
  return events.some(e => {
    if (e.all_day || e.status === 'cancelled') return false;
    const eStart = new Date(e.start_time).getTime();
    const eEnd = new Date(e.end_time).getTime();
    return iStart < eEnd && eStart < iEnd;
  });
}

function formatInviteDateTime(startTime: string | null, endTime: string | null): { date: string; time: string } {
  if (!startTime) return { date: 'Date unknown', time: '' };
  const d = new Date(startTime);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const dateStr = isToday
    ? 'Today'
    : isTomorrow
      ? 'Tomorrow'
      : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const timeStr = endTime
    ? `${formatTime(startTime)} – ${formatTime(endTime)}`
    : formatTime(startTime);

  return { date: dateStr, time: timeStr };
}

export function InviteReviewPanel({ invites, isLoading, onRefresh, onDismiss, onRsvp, confirmedEvents, onDateSelect }: Props) {
  const invitesWithConflicts = useMemo(
    () => invites.map(inv => ({ ...inv, conflict: hasConflict(inv, confirmedEvents) })),
    [invites, confirmedEvents],
  );

  const [actionStates, setActionStates] = useState<Record<string, 'loading' | 'error'>>({});

  const handleAction = async (invite: PendingInvite, response: RsvpResponse) => {
    setActionStates(prev => ({ ...prev, [invite.threadId]: 'loading' }));
    try {
      onDismiss(invite.threadId);
      await onRsvp(invite, response);
    } catch (e: any) {
      console.error(`[Dagaz] RSVP failed for "${invite.title}":`, e);
      setActionStates(prev => ({ ...prev, [invite.threadId]: 'error' }));
    }
  };

  return (
    <div className="w-80 border-l border-border-subtle bg-bg-secondary flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-text-primary">Pending Invites</h2>
          <span className="px-1.5 py-0.5 rounded-full bg-accent-primary/20 text-accent-primary text-[10px] font-semibold">
            {invites.length}
          </span>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors disabled:opacity-40"
          title="Refresh invites"
        >
          <svg
            className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Invite list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {invites.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-text-muted px-6">
            <svg className="w-8 h-8 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs">All caught up</span>
          </div>
        )}
        {invitesWithConflicts.map((invite, idx) => {
          const { date, time } = formatInviteDateTime(invite.startTime, invite.endTime);
          return (
            <div
              key={invite.threadId}
              className={`p-4 ${idx > 0 ? 'border-t border-border-subtle' : ''} hover:bg-bg-hover/50 transition-colors`}
            >
              {/* Title */}
              <div
                className="text-sm font-medium text-text-primary cursor-pointer hover:text-accent-primary transition-colors leading-snug"
                onClick={() => invite.startTime && onDateSelect(new Date(invite.startTime))}
                title={invite.subject}
              >
                {invite.title}
              </div>

              {/* Date & time */}
              <div className="flex items-center gap-1.5 mt-1.5">
                <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs text-text-secondary">{date}</span>
              </div>
              {time && (
                <div className="flex items-center gap-1.5 mt-1">
                  <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs text-accent-primary font-medium">{time}</span>
                </div>
              )}

              {/* Organizer */}
              <div className="flex items-center gap-1.5 mt-1.5">
                <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-xs text-text-secondary truncate" title={invite.organizerEmail}>
                  {invite.organizer}
                </span>
              </div>

              {/* Conflict warning */}
              {invite.conflict && (
                <div className="flex items-center gap-1.5 mt-2 px-2 py-1.5 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                  <svg className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-[10px] text-yellow-400 font-medium">Conflicts with existing event</span>
                </div>
              )}

              {/* Actions */}
              {actionStates[invite.threadId] === 'loading' ? (
                <div className="mt-3 text-xs text-text-muted animate-pulse">Updating...</div>
              ) : actionStates[invite.threadId] === 'error' ? (
                <button
                  onClick={() => handleAction(invite, 'accepted')}
                  className="mt-3 text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Failed — click to retry
                </button>
              ) : (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleAction(invite, 'accepted')}
                    className="flex-1 px-2 py-1.5 rounded-md text-xs font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleAction(invite, 'tentative')}
                    className="flex-1 px-2 py-1.5 rounded-md text-xs font-medium bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-colors"
                  >
                    Maybe
                  </button>
                  <button
                    onClick={() => handleAction(invite, 'declined')}
                    className="flex-1 px-2 py-1.5 rounded-md text-xs font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
