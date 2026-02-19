import { useState, useCallback, useRef, useEffect } from 'react';
import type { CalendarEvent } from '../../shared/types';

export type DragMode = 'move' | 'resize-top' | 'resize-bottom';

export interface DragState {
  event: CalendarEvent;
  mode: DragMode;
  /** Minutes offset from original start (for move) or new start minute (for resize-top) */
  startMinutes: number;
  /** New end in minutes from midnight */
  endMinutes: number;
  /** Which day column index the event is over (for cross-day move) */
  dayIndex: number;
  /** Original day index the event started on */
  originalDayIndex: number;
}

export interface DragResult {
  dragState: DragState | null;
  /** True while any drag is in progress */
  isDragging: boolean;
  /** Start a drag interaction — call from mousedown on the event block */
  startDrag: (
    event: CalendarEvent,
    mode: DragMode,
    mouseY: number,
    dayIndex: number,
    scrollContainer: HTMLElement,
    dayColumnSelector: string,
  ) => void;
  /** Get the preview style for the ghost block during drag */
  getGhostStyle: (hourHeight: number) => React.CSSProperties | null;
  /** Get ghost label (time range) */
  getGhostLabel: (use24h: boolean) => string;
}

const SNAP_MINUTES = 15;

function snapToGrid(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function clampMinutes(m: number): number {
  return Math.max(0, Math.min(24 * 60 - SNAP_MINUTES, m));
}

function formatMinutes(mins: number, use24h: boolean): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (use24h) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function useEventDrag(
  onDragEnd: (event: CalendarEvent, newStart: Date, newEnd: Date, dayIndex: number) => void,
): DragResult {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<{
    event: CalendarEvent;
    mode: DragMode;
    origStartMin: number;
    origEndMin: number;
    origDayIndex: number;
    mouseStartY: number;
    scrollContainer: HTMLElement;
    dayColumnSelector: string;
    hourHeight: number;
  } | null>(null);
  // Brief cooldown after drag ends to suppress the click event that follows mouseup
  const dragCooldownRef = useRef(false);

  const isDragging = dragState !== null || dragCooldownRef.current;

  const startDrag = useCallback((
    event: CalendarEvent,
    mode: DragMode,
    mouseY: number,
    dayIndex: number,
    scrollContainer: HTMLElement,
    dayColumnSelector: string,
  ) => {
    const s = new Date(event.start_time);
    const e = new Date(event.end_time);
    const startMin = s.getHours() * 60 + s.getMinutes();
    const endMin = e.getHours() * 60 + e.getMinutes();

    dragRef.current = {
      event,
      mode,
      origStartMin: startMin,
      origEndMin: Math.max(endMin, startMin + 15),
      origDayIndex: dayIndex,
      mouseStartY: mouseY,
      scrollContainer,
      dayColumnSelector,
      hourHeight: 60,
    };

    setDragState({
      event,
      mode,
      startMinutes: startMin,
      endMinutes: Math.max(endMin, startMin + 15),
      dayIndex,
      originalDayIndex: dayIndex,
    });
  }, []);

  useEffect(() => {
    if (!dragRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const ref = dragRef.current;
      if (!ref) return;

      const deltaY = e.clientY - ref.mouseStartY;
      const deltaMinutes = (deltaY / ref.hourHeight) * 60;

      let newStart = ref.origStartMin;
      let newEnd = ref.origEndMin;

      if (ref.mode === 'move') {
        const shift = snapToGrid(deltaMinutes);
        newStart = clampMinutes(ref.origStartMin + shift);
        const duration = ref.origEndMin - ref.origStartMin;
        newEnd = Math.min(newStart + duration, 24 * 60);
        if (newEnd - newStart < SNAP_MINUTES) {
          newStart = newEnd - duration;
        }
      } else if (ref.mode === 'resize-bottom') {
        newEnd = clampMinutes(snapToGrid(ref.origEndMin + deltaMinutes));
        if (newEnd <= newStart + SNAP_MINUTES) newEnd = newStart + SNAP_MINUTES;
      } else if (ref.mode === 'resize-top') {
        newStart = clampMinutes(snapToGrid(ref.origStartMin + deltaMinutes));
        if (newStart >= newEnd - SNAP_MINUTES) newStart = newEnd - SNAP_MINUTES;
      }

      // Detect day column changes for move mode
      let dayIndex = ref.origDayIndex;
      if (ref.mode === 'move') {
        const columns = ref.scrollContainer.querySelectorAll(ref.dayColumnSelector);
        for (let i = 0; i < columns.length; i++) {
          const rect = columns[i].getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX < rect.right) {
            dayIndex = i;
            break;
          }
        }
      }

      setDragState({
        event: ref.event,
        mode: ref.mode,
        startMinutes: newStart,
        endMinutes: newEnd,
        dayIndex,
        originalDayIndex: ref.origDayIndex,
      });
    };

    const handleMouseUp = () => {
      const ref = dragRef.current;
      const state = dragState;
      if (ref && state) {
        const hasChanged =
          state.startMinutes !== ref.origStartMin ||
          state.endMinutes !== ref.origEndMin ||
          state.dayIndex !== ref.origDayIndex;

        if (hasChanged) {
          const origStart = new Date(ref.event.start_time);
          const newStart = new Date(origStart);
          const newEnd = new Date(origStart);

          newStart.setHours(0, 0, 0, 0);
          newStart.setMinutes(state.startMinutes);
          newEnd.setHours(0, 0, 0, 0);
          newEnd.setMinutes(state.endMinutes);

          onDragEnd(ref.event, newStart, newEnd, state.dayIndex);
        }
      }

      dragRef.current = null;
      setDragState(null);
      // Suppress the click event that fires right after mouseup
      dragCooldownRef.current = true;
      requestAnimationFrame(() => { dragCooldownRef.current = false; });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
    document.body.style.cursor = dragRef.current?.mode === 'move' ? 'grabbing' : 'ns-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [dragState, onDragEnd]);

  const getGhostStyle = useCallback((hourHeight: number): React.CSSProperties | null => {
    if (!dragState) return null;
    const top = (dragState.startMinutes / 60) * hourHeight;
    const height = Math.max(((dragState.endMinutes - dragState.startMinutes) / 60) * hourHeight - 2, 18);
    return {
      position: 'absolute',
      top: `${top}px`,
      height: `${height}px`,
      left: '1px',
      right: '2px',
      zIndex: 50,
      pointerEvents: 'none',
    };
  }, [dragState]);

  const getGhostLabel = useCallback((use24h: boolean): string => {
    if (!dragState) return '';
    return `${formatMinutes(dragState.startMinutes, use24h)} – ${formatMinutes(dragState.endMinutes, use24h)}`;
  }, [dragState]);

  return { dragState, isDragging, startDrag, getGhostStyle, getGhostLabel };
}
