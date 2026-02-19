import React, { useState, useEffect } from 'react';
import type { CalendarEvent, Attendee } from '../../shared/types';
import { formatTime, formatTimeRange } from '../lib/utils';

interface Props {
  event: CalendarEvent | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  onRSVP: (id: string, response: 'accepted' | 'declined' | 'tentative') => void | Promise<void>;
  onEdit: (event: CalendarEvent) => void;
}

export function EventDetail({ event, onClose, onDelete, onRSVP, onEdit }: Props) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fullEvent, setFullEvent] = useState<CalendarEvent | null>(null);

  const [rsvpVersion, setRsvpVersion] = useState(0);

  // Fetch full event with attendees when selected or after RSVP
  useEffect(() => {
    if (event) {
      setShowDeleteConfirm(false);
      window.dagaz.getEvent(event.id).then((e) => {
        if (e) setFullEvent(e);
        else setFullEvent(event);
      }).catch(() => setFullEvent(event));
    } else {
      setFullEvent(null);
    }
  }, [event?.id, event?.self_response, rsvpVersion]);

  if (!event) return null;
  const ev = fullEvent || event;
  const isOverlayEvent = ev.id.startsWith('overlay-');

  const videoEntry = ev.conference_data?.entryPoints?.find(ep => ep.entryPointType === 'video');
  const phoneEntry = ev.conference_data?.entryPoints?.find(ep => ep.entryPointType === 'phone');
  const conferenceLink = videoEntry?.uri || ev.hangout_link;
  const conferenceName = ev.conference_data?.conferenceSolution?.name || 'Meeting';

  const handleJoin = () => {
    if (conferenceLink) window.dagaz.openExternal(conferenceLink);
  };

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete(ev.id);
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
    }
  };

  const handleOpenInGoogle = () => {
    if (ev.html_link) window.dagaz.openExternal(ev.html_link);
  };

  // Date/time formatting
  const startDate = new Date(ev.all_day ? (ev.start_date || ev.start_time) : ev.start_time);
  const endDate = new Date(ev.all_day ? (ev.end_date || ev.end_time) : ev.end_time);

  const dateDisplay = startDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const timeDisplay = ev.all_day
    ? 'All day'
    : formatTimeRange(ev.start_time, ev.end_time);

  // Recurrence — show parsed rule, or fallback for recurring instances
  const recurrenceText = ev.recurrence_rule
    ? parseRecurrence(ev.recurrence_rule)
    : ev.recurring_event_id ? 'Recurring event' : null;

  // Reminders
  const reminderText = ev.reminders && ev.reminders.length > 0
    ? ev.reminders.map(r => `${r.minutes} min before (${r.method})`).join(', ')
    : null;

  // Organizer
  const organizer = ev.attendees?.find(a => !!a.is_organizer);
  const selfAttendee = ev.attendees?.find(a => !!a.is_self);
  const otherAttendees = ev.attendees?.filter(a => !a.is_organizer && !a.is_self) || [];
  const totalGuests = (ev.attendees || []).length;

  const responseStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted': return '✓';
      case 'declined': return '✗';
      case 'tentative': return '?';
      default: return '○';
    }
  };

  const responseStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'text-green-400';
      case 'declined': return 'text-red-400';
      case 'tentative': return 'text-yellow-400';
      default: return 'text-text-muted';
    }
  };

  const formatResponseStatus = (status: string | null) => {
    switch (status) {
      case 'accepted': return 'Accepted';
      case 'declined': return 'Declined';
      case 'tentative': return 'Maybe';
      case 'needsAction': return 'Needs Action';
      default: return 'No response';
    }
  };

  return (
    <div className="w-80 border-l border-border-subtle bg-bg-secondary flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-2 p-4 border-b border-border-subtle">
        <span
          className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0"
          style={{ backgroundColor: ev.calendar_color || '#4A9AC2' }}
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-text-primary leading-snug">{ev.summary || '(No title)'}</h2>
          <p className="text-xs text-text-secondary mt-1">{dateDisplay}</p>
          <p className="text-xs text-accent-primary font-medium">{timeDisplay}</p>
          {recurrenceText && (
            <p className="text-[10px] text-text-muted mt-0.5">↻ {recurrenceText}</p>
          )}
          {reminderText && (
            <p className="text-[10px] text-text-muted mt-0.5">🔔 {reminderText}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {/* Join meeting button */}
        {conferenceLink && (
          <button
            onClick={handleJoin}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg brand-gradient text-white text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Join {conferenceName}
          </button>
        )}

        {/* Conference details */}
        {(videoEntry || phoneEntry) && (
          <div className="space-y-1.5">
            {videoEntry?.uri && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted w-10 flex-shrink-0">Link</span>
                <a
                  className="text-[11px] text-accent-primary hover:underline truncate cursor-pointer"
                  onClick={() => window.dagaz.openExternal(videoEntry.uri)}
                >
                  {videoEntry.label || videoEntry.uri}
                </a>
              </div>
            )}
            {phoneEntry?.uri && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted w-10 flex-shrink-0">Phone</span>
                <span className="text-[11px] text-text-secondary">{phoneEntry.label || phoneEntry.uri}</span>
              </div>
            )}
          </div>
        )}

        {/* Attachments / Documents */}
        {ev.attachments && ev.attachments.length > 0 && (
          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Documents</h3>
            <div className="space-y-1.5">
              {ev.attachments.map((att, i) => (
                <a
                  key={i}
                  onClick={() => window.dagaz.openExternal(att.fileUrl)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-bg-tertiary hover:bg-bg-hover cursor-pointer transition-colors group"
                >
                  {att.iconLink ? (
                    <img src={att.iconLink} alt="" className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <svg className="w-4 h-4 flex-shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  )}
                  <span className="text-xs text-text-primary truncate group-hover:text-accent-primary transition-colors">
                    {att.title}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Location */}
        {ev.location && (
          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Location</h3>
            <p className="text-xs text-text-primary">{ev.location}</p>
          </div>
        )}

        {/* Guests / Attendees */}
        {totalGuests > 0 && (
          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">
              {totalGuests} {totalGuests === 1 ? 'guest' : 'guests'}
              {(() => {
                const accepted = (ev.attendees || []).filter(a => a.response_status === 'accepted').length;
                if (accepted > 0) return ` · ${accepted} yes`;
                return '';
              })()}
            </h3>
            <div className="space-y-1 mt-1.5">
              {/* Organizer first */}
              {organizer && (
                <div className="flex items-center gap-2 py-0.5">
                  <span className={`text-xs font-medium w-4 text-center ${responseStatusColor(organizer.response_status)}`}>
                    {responseStatusIcon(organizer.response_status)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-text-primary truncate block">
                      {organizer.display_name || organizer.email}
                      <span className="text-text-muted ml-1 text-[10px]">Organizer</span>
                    </span>
                  </div>
                </div>
              )}
              {/* Self if not organizer */}
              {selfAttendee && !selfAttendee.is_organizer && (
                <div className="flex items-center gap-2 py-0.5">
                  <span className={`text-xs font-medium w-4 text-center ${responseStatusColor(selfAttendee.response_status)}`}>
                    {responseStatusIcon(selfAttendee.response_status)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-text-primary truncate block">
                      {selfAttendee.display_name || selfAttendee.email}
                      <span className="text-accent-primary ml-1 text-[10px]">(you)</span>
                    </span>
                  </div>
                </div>
              )}
              {/* Other attendees */}
              {otherAttendees.map((a, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5">
                  <span className={`text-xs font-medium w-4 text-center ${responseStatusColor(a.response_status)}`}>
                    {responseStatusIcon(a.response_status)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-text-primary truncate block">
                      {a.display_name || a.email}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RSVP buttons */}
        {!isOverlayEvent && !!selfAttendee && !ev.is_organizer && (
          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-2">
              Your status: <span className={responseStatusColor(ev.self_response || 'needsAction')}>
                {formatResponseStatus(ev.self_response)}
              </span>
            </h3>
            <div className="flex gap-2">
              {(['accepted', 'tentative', 'declined'] as const).map(response => (
                <button
                  key={response}
                  onClick={async () => { await onRSVP(ev.id, response); setRsvpVersion(v => v + 1); }}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    ev.self_response === response
                      ? response === 'accepted' ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/40'
                        : response === 'tentative' ? 'bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500/40'
                        : 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40'
                      : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
                  }`}
                >
                  {response === 'accepted' ? 'Accept' : response === 'tentative' ? 'Maybe' : 'Decline'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {ev.description && (
          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Description</h3>
            <div
              className="text-xs text-text-secondary leading-relaxed selectable prose-links"
              dangerouslySetInnerHTML={{ __html: ev.description }}
            />
          </div>
        )}

        {/* Calendar info */}
        <div className="pt-2 border-t border-border-subtle space-y-1.5">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: ev.calendar_color || '#4A9AC2' }}
            />
            <span className="text-[10px] text-text-muted truncate">{ev.calendar_id}</span>
          </div>
          {ev.transparency === 'transparent' && (
            <p className="text-[10px] text-text-muted">Shown as: Free</p>
          )}
          {ev.visibility && ev.visibility !== 'default' && (
            <p className="text-[10px] text-text-muted">Visibility: {ev.visibility}</p>
          )}
        </div>
      </div>

      {/* Actions footer */}
      {isOverlayEvent ? (
        <div className="p-3 border-t border-border-subtle">
          <p className="text-[10px] text-text-muted text-center">Viewing {ev.organizer_email}'s calendar</p>
        </div>
      ) : (
        <div className="p-3 border-t border-border-subtle flex gap-2">
          {ev.html_link && (
            <button
              onClick={handleOpenInGoogle}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-bg-tertiary text-text-secondary hover:bg-bg-hover transition-colors"
              title="Open in Google Calendar"
            >
              ↗ Google
            </button>
          )}
          <button
            onClick={() => onEdit(ev)}
            className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium bg-bg-tertiary text-text-primary hover:bg-bg-hover transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              showDeleteConfirm
                ? 'bg-red-500/20 text-red-400'
                : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-red-400'
            }`}
          >
            {showDeleteConfirm ? 'Confirm' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  );
}

/** Parse RRULE into human-readable text */
function parseRecurrence(rule: string): string {
  const lines = rule.split('\n');
  for (const line of lines) {
    const match = line.match(/RRULE:FREQ=(\w+)/i);
    if (match) {
      const freq = match[1].toLowerCase();
      const interval = line.match(/INTERVAL=(\d+)/i);
      const n = interval ? parseInt(interval[1]) : 1;
      const byDay = line.match(/BYDAY=([^;]+)/i);

      const freqText = freq === 'daily' ? 'day' : freq === 'weekly' ? 'week' : freq === 'monthly' ? 'month' : freq === 'yearly' ? 'year' : freq;

      let text = n === 1 ? `Repeats every ${freqText}` : `Repeats every ${n} ${freqText}s`;
      if (byDay) {
        const days = byDay[1].split(',').map(d => {
          const map: Record<string, string> = { MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun' };
          return map[d.trim()] || d;
        });
        text += ` on ${days.join(', ')}`;
      }

      const until = line.match(/UNTIL=(\d{8})/i);
      if (until) {
        const d = until[1];
        text += ` until ${d.slice(4, 6)}/${d.slice(6, 8)}/${d.slice(0, 4)}`;
      }

      const count = line.match(/COUNT=(\d+)/i);
      if (count) {
        text += `, ${count[1]} times`;
      }

      return text;
    }
  }
  return 'Repeats';
}
