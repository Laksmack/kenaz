import React, { useEffect, useRef } from 'react';
import type { CalendarEvent } from '../../shared/types';

interface Props {
  event: CalendarEvent;
  onRSVP: (id: string, response: 'accepted' | 'declined' | 'tentative') => void;
  onClose: () => void;
}

export function RSVPMenu({ event, onRSVP, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'y' || e.key === '1') { onRSVP(event.id, 'accepted'); onClose(); return; }
      if (e.key === 'm' || e.key === '2') { onRSVP(event.id, 'tentative'); onClose(); return; }
      if (e.key === 'n' || e.key === '3') { onRSVP(event.id, 'declined'); onClose(); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [event.id, onRSVP, onClose]);

  // Determine if RSVP is applicable
  const selfAttendee = event.attendees?.find(a => a.is_self);
  if (!selfAttendee || event.is_organizer) {
    // Can't RSVP to own events
    return null;
  }

  const options = [
    { key: 'Y', response: 'accepted' as const, label: 'Accept', color: 'text-green-400', bg: 'hover:bg-green-500/10' },
    { key: 'M', response: 'tentative' as const, label: 'Maybe', color: 'text-yellow-400', bg: 'hover:bg-yellow-500/10' },
    { key: 'N', response: 'declined' as const, label: 'Decline', color: 'text-red-400', bg: 'hover:bg-red-500/10' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <div
        ref={ref}
        className="relative bg-bg-secondary border border-border-subtle rounded-xl shadow-2xl w-[220px] animate-slide-up overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-3 pt-3 pb-1.5">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">RSVP</p>
          <p className="text-xs text-text-primary truncate mt-0.5">{event.summary}</p>
        </div>
        <div className="py-1">
          {options.map(opt => (
            <button
              key={opt.response}
              onClick={() => { onRSVP(event.id, opt.response); onClose(); }}
              className={`w-full text-left px-3 py-2 flex items-center gap-2.5 text-xs transition-colors ${opt.bg} ${
                event.self_response === opt.response ? opt.color + ' font-medium' : 'text-text-secondary'
              }`}
            >
              <kbd className="text-[10px] text-text-muted bg-bg-tertiary px-1 py-0.5 rounded min-w-[18px] text-center">{opt.key}</kbd>
              <span>{opt.label}</span>
              {event.self_response === opt.response && (
                <span className="ml-auto text-[10px] text-text-muted">current</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
