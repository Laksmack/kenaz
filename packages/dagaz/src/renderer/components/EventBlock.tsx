import React, { useCallback, useRef, useState, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { CalendarEvent } from '../../shared/types';
import { formatTime } from '../lib/utils';
import type { DragMode } from '../hooks/useEventDrag';
import { createDraftFromEvent, createNoteFromEvent, createTodoFromEvent, type EventContext } from '@futhark/core/lib/crossApp';

interface Props {
  event: CalendarEvent;
  selected: boolean;
  onClick: (event: CalendarEvent) => void;
  onRSVP?: (eventId: string, response: 'accepted' | 'declined' | 'tentative') => void;
  onDelete?: (eventId: string) => void;
  onDragStart?: (event: CalendarEvent, mode: DragMode, mouseY: number) => void;
  style?: React.CSSProperties;
  compact?: boolean;
  isDragGhost?: boolean;
}

const DRAG_THRESHOLD = 4;

export function EventBlock({ event, selected, onClick, onRSVP, onDelete, onDragStart, style, compact, isDragGhost }: Props) {
  const color = event.calendar_color || '#4A9AC2';
  const isInvite = event.self_response === 'needsAction' && !event.is_organizer;
  const canDrag = !event.all_day && !compact && !!onDragStart;

  const hasConferencing = event.conference_data?.entryPoints?.some(
    ep => ep.entryPointType === 'video'
  ) || !!event.hangout_link;

  const mouseDownRef = useRef<{ y: number; mode: DragMode; moved: boolean } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxPos, setCtxPos] = useState<{ left: number; top: number } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!ctxMenu || !ctxRef.current) return;
    const rect = ctxRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = ctxMenu.x + rect.width > vw ? vw - rect.width - 4 : ctxMenu.x;
    const top = ctxMenu.y + rect.height > vh ? ctxMenu.y - rect.height : ctxMenu.y;
    setCtxPos({ left, top });
  }, [ctxMenu]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => { if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('contextmenu', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('contextmenu', close); document.removeEventListener('keydown', esc); };
  }, [ctxMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxPos(null);
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, mode: DragMode) => {
    if (!canDrag || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    mouseDownRef.current = { y: e.clientY, mode, moved: false };

    const onMove = (me: MouseEvent) => {
      if (!mouseDownRef.current) return;
      if (!mouseDownRef.current.moved && Math.abs(me.clientY - mouseDownRef.current.y) >= DRAG_THRESHOLD) {
        mouseDownRef.current.moved = true;
        onDragStart!(event, mouseDownRef.current.mode, mouseDownRef.current.y);
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (mouseDownRef.current && !mouseDownRef.current.moved) {
        onClick(event);
      }
      mouseDownRef.current = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [canDrag, event, onDragStart, onClick]);

  return (
    <div
      className={`event-block ${selected ? 'selected' : ''} ${event.all_day ? 'all-day' : ''} ${!event.all_day ? 'h-full' : ''} ${isInvite ? 'event-invite' : ''} ${isDragGhost ? 'drag-ghost' : ''} ${canDrag ? 'group' : ''}`}
      style={{
        '--event-color': color,
        opacity: isDragGhost ? 0.85 : undefined,
        ...style,
      } as React.CSSProperties}
      onClick={(e) => { e.stopPropagation(); if (!canDrag) onClick(event); }}
      onMouseDown={canDrag ? (e) => handleMouseDown(e, 'move') : undefined}
      onContextMenu={handleContextMenu}
      title={`${event.summary}\n${formatTime(event.start_time)} – ${formatTime(event.end_time)}${isInvite ? '\n📨 Invitation — pending response' : ''}${event.location ? `\n📍 ${event.location}` : ''}`}
    >
      {/* Top resize handle */}
      {canDrag && (
        <div
          className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 'resize-top'); }}
        >
          <div className="mx-auto mt-0.5 w-6 h-0.5 rounded-full bg-white/40" />
        </div>
      )}

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

      {/* Bottom resize handle */}
      {canDrag && (
        <div
          className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 'resize-bottom'); }}
        >
          <div className="mx-auto mb-0.5 w-6 h-0.5 rounded-full bg-white/40" />
        </div>
      )}

      {/* Cross-app context menu — portaled to body to escape stacking contexts */}
      {ctxMenu && (() => {
        const ctx: EventContext = {
          id: event.id,
          summary: event.summary,
          description: event.description,
          location: event.location,
          startTime: event.start_time,
          endTime: event.end_time,
          attendees: (event.attendees || []).map(a => ({ email: a.email, displayName: a.display_name })),
          organizerEmail: event.organizer_email,
        };
        const fetcher = window.dagaz.crossAppFetch;
        const actions: { label: string; icon: string; fn: () => void; danger?: boolean }[] = [
          { label: 'Email Recipients', icon: 'ᚲ', fn: async () => { try { await createDraftFromEvent(fetcher, ctx); window.dagaz.notify('Kenaz', `Draft created for: ${ctx.summary}`); } catch { window.dagaz.notify('Kenaz', 'Failed — is Kenaz running?'); } } },
          { label: 'Create Meeting Note', icon: 'ᛚ', fn: async () => { try { await createNoteFromEvent(fetcher, ctx); window.dagaz.notify('Laguz', `Note created: ${ctx.summary}`); } catch { window.dagaz.notify('Laguz', 'Failed — is Laguz running?'); } } },
          { label: 'Create Prep Todo', icon: 'ᚱ', fn: async () => { try { await createTodoFromEvent(fetcher, ctx); window.dagaz.notify('Raidō', `Todo created: Prepare: ${ctx.summary}`); } catch { window.dagaz.notify('Raidō', 'Failed — is Raidō running?'); } } },
        ];
        if (onDelete) {
          actions.push({ label: 'Delete This Event', icon: '🗑', fn: () => onDelete(event.id), danger: true });
        }
        return createPortal(
          <div
            ref={ctxRef}
            className="fixed z-[9999] py-1 min-w-[200px] rounded-lg shadow-2xl border border-[#2a3f5a]"
            style={{
              left: ctxPos?.left ?? ctxMenu.x,
              top: ctxPos?.top ?? ctxMenu.y,
              visibility: ctxPos ? 'visible' : 'hidden',
              backgroundColor: '#111d2e',
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={() => { a.fn(); setCtxMenu(null); }}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-bg-hover transition-colors ${
                  a.danger
                    ? 'text-red-400 hover:text-red-300 border-t border-[#2a3f5a] mt-0.5 pt-2'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <span className="w-4 text-center">{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
