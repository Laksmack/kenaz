import React, { useState, useMemo } from 'react';
import type { PendingInvite, CalendarEvent } from '../../shared/types';
import { formatTime } from '../lib/utils';

interface Props {
  invites: PendingInvite[];
  isLoading: boolean;
  onRefresh: () => void;
  onDismiss: (threadId: string) => void;
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

function formatInviteDate(startTime: string | null): string {
  if (!startTime) return 'Time unknown';
  const d = new Date(startTime);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const timeStr = formatTime(startTime);
  if (isToday) return `Today ${timeStr}`;
  if (isTomorrow) return `Tomorrow ${timeStr}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${timeStr}`;
}

export function PendingInvitesPanel({ invites, isLoading, onRefresh, onDismiss, confirmedEvents, onDateSelect }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const invitesWithConflicts = useMemo(
    () => invites.map(inv => ({ ...inv, conflict: hasConflict(inv, confirmedEvents) })),
    [invites, confirmedEvents],
  );

  const handleRsvp = (invite: PendingInvite, response: 'accepted' | 'tentative' | 'declined') => {
    // TODO: Send RSVP via Gmail API through Kenaz — non-trivial, stubbed for now
    console.log(`[Dagaz] RSVP stub: ${response} for thread ${invite.threadId} ("${invite.title}")`);
    onDismiss(invite.threadId);
  };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-2 mb-1">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-muted font-medium hover:text-text-secondary transition-colors"
        >
          <svg
            className={`w-2.5 h-2.5 transition-transform ${collapsed ? '' : 'rotate-90'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Invites
          {invites.length > 0 && (
            <span className="ml-1 px-1.5 py-px rounded-full bg-accent-primary/20 text-accent-primary text-[9px] font-semibold">
              {invites.length}
            </span>
          )}
        </button>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors disabled:opacity-40"
          title="Refresh invites"
        >
          <svg
            className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-1">
          {invites.length === 0 ? (
            <p className="text-[10px] text-text-muted px-2 py-1">No pending invites</p>
          ) : (
            invitesWithConflicts.map(invite => (
              <div
                key={invite.threadId}
                className="px-2 py-1.5 rounded-md hover:bg-bg-hover transition-colors group"
              >
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px] flex-shrink-0 mt-px">📨</span>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-xs text-text-primary truncate cursor-pointer hover:text-accent-primary transition-colors"
                      onClick={() => invite.startTime && onDateSelect(new Date(invite.startTime))}
                      title={invite.subject}
                    >
                      {invite.title}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px] text-text-muted truncate">
                        {formatInviteDate(invite.startTime)}
                      </span>
                      {invite.conflict && (
                        <span className="text-[10px] flex-shrink-0" title="Conflicts with an existing event">⚠️</span>
                      )}
                    </div>
                    <div className="text-[10px] text-text-muted truncate" title={invite.organizerEmail}>
                      {invite.organizer}
                    </div>
                    {/* RSVP stub buttons */}
                    <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleRsvp(invite, 'accepted')}
                        className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                      >Accept</button>
                      <button
                        onClick={() => handleRsvp(invite, 'tentative')}
                        className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors"
                      >Maybe</button>
                      <button
                        onClick={() => handleRsvp(invite, 'declined')}
                        className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                      >Decline</button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
