import React from 'react';
import type { CalendarEvent } from '../../shared/types';
import { formatTime } from '../lib/utils';

interface Props {
  event: CalendarEvent;
  selected: boolean;
  onClick: (event: CalendarEvent) => void;
  onRSVP?: (eventId: string, response: 'accepted' | 'declined' | 'tentative') => void;
  style?: React.CSSProperties;
  compact?: boolean;
}

export function EventBlock({ event, selected, onClick, onRSVP, style, compact }: Props) {
  const color = event.calendar_color || '#4A9AC2';
  const isInvite = event.self_response === 'needsAction' && !event.is_organizer;

  const hasConferencing = event.conference_data?.entryPoints?.some(
    ep => ep.entryPointType === 'video'
  ) || !!event.hangout_link;

  return (
    <div
      className={`event-block ${selected ? 'selected' : ''} ${event.all_day ? 'all-day' : ''} ${!event.all_day ? 'h-full' : ''} ${isInvite ? 'event-invite' : ''}`}
      style={{
        '--event-color': color,
        ...style,
      } as React.CSSProperties}
      onClick={(e) => { e.stopPropagation(); onClick(event); }}
      title={`${event.summary}\n${formatTime(event.start_time)} – ${formatTime(event.end_time)}${isInvite ? '\n📨 Invitation — pending response' : ''}${event.location ? `\n📍 ${event.location}` : ''}`}
    >
      <div className="flex items-center gap-1 min-w-0">
        {isInvite && <span className="flex-shrink-0 text-[10px] opacity-70">📨</span>}
        <span className="font-medium truncate text-text-primary" style={{ fontSize: compact ? '10px' : '11px' }}>
          {event.summary || '(No title)'}
        </span>
        {hasConferencing && (
          <svg className="w-2.5 h-2.5 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </div>
      {!compact && !event.all_day && (
        <div className="text-[10px] text-text-secondary mt-0.5">
          {formatTime(event.start_time)}
          {event.location && (
            <span className="ml-1.5 opacity-70">· {event.location}</span>
          )}
        </div>
      )}
      {/* Inline RSVP buttons for pending invites */}
      {isInvite && onRSVP && !compact && !event.all_day && (
        <div className="flex gap-1 mt-1">
          <button
            onClick={(e) => { e.stopPropagation(); onRSVP(event.id, 'accepted'); }}
            className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
          >Yes</button>
          <button
            onClick={(e) => { e.stopPropagation(); onRSVP(event.id, 'tentative'); }}
            className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors"
          >Maybe</button>
          <button
            onClick={(e) => { e.stopPropagation(); onRSVP(event.id, 'declined'); }}
            className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
          >No</button>
        </div>
      )}
    </div>
  );
}
