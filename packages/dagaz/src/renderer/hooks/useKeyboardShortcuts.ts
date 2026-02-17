import { useEffect, useCallback } from 'react';
import type { ViewType, CalendarEvent } from '../../shared/types';

interface ShortcutHandlers {
  onViewChange: (view: ViewType) => void;
  onNavigateNext: () => void;
  onNavigatePrev: () => void;
  onGoToToday: () => void;
  onQuickCreate: () => void;
  onEditEvent: () => void;
  onDeleteEvent: () => void;
  onOpenDetail: () => void;
  onClosePanel: () => void;
  onSearch: () => void;
  onGoToDate: () => void;
  onDuplicate: () => void;
  onRSVP: () => void;
  onJoinMeeting: () => void;
  onShowHelp: () => void;
  onToggleWeekDays: () => void;
  onSettings: () => void;
  selectedEvent: CalendarEvent | null;
  currentView: ViewType;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const {
    onViewChange, onNavigateNext, onNavigatePrev, onGoToToday,
    onQuickCreate, onEditEvent, onDeleteEvent, onOpenDetail,
    onClosePanel, onSearch, onGoToDate, onDuplicate, onRSVP,
    onJoinMeeting, onShowHelp, onToggleWeekDays, onSettings,
    selectedEvent, currentView,
  } = handlers;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      // Always handle Escape
      if (e.key === 'Escape') {
        if (isInput) {
          (target as HTMLInputElement).blur();
        }
        onClosePanel();
        return;
      }

      // Modifier shortcuts
      if (e.key === ',' && (e.metaKey || e.altKey)) {
        e.preventDefault();
        onSettings();
        return;
      }

      if (e.key === 'd' && e.metaKey && !e.shiftKey) {
        e.preventDefault();
        onDuplicate();
        return;
      }

      // Don't intercept typing in inputs
      if (isInput) return;

      // Don't intercept when modifiers are held (except shift)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 't':
          e.preventDefault();
          onGoToToday();
          break;
        case 'd':
          e.preventDefault();
          onViewChange('day');
          break;
        case 'w':
          e.preventDefault();
          if (e.shiftKey) {
            onToggleWeekDays();
          } else {
            onViewChange('week');
          }
          break;
        case 'm':
          e.preventDefault();
          onViewChange('month');
          break;
        case 'a':
          e.preventDefault();
          onViewChange('agenda');
          break;
        case 'c':
          e.preventDefault();
          onQuickCreate();
          break;
        case 'e':
          if (selectedEvent) {
            e.preventDefault();
            onEditEvent();
          }
          break;
        case 'delete':
        case 'backspace':
          if (selectedEvent) {
            e.preventDefault();
            onDeleteEvent();
          }
          break;
        case 'enter':
          if (selectedEvent) {
            e.preventDefault();
            onOpenDetail();
          }
          break;
        case 'n':
          e.preventDefault();
          onNavigateNext();
          break;
        case 'p':
          e.preventDefault();
          onNavigatePrev();
          break;
        case 'g':
          e.preventDefault();
          onGoToDate();
          break;
        case '/':
          e.preventDefault();
          onSearch();
          break;
        case 'r':
          if (selectedEvent) {
            e.preventDefault();
            onRSVP();
          }
          break;
        case 'j':
          if (selectedEvent) {
            e.preventDefault();
            onJoinMeeting();
          }
          break;
        case '?':
          e.preventDefault();
          onShowHelp();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    onViewChange, onNavigateNext, onNavigatePrev, onGoToToday,
    onQuickCreate, onEditEvent, onDeleteEvent, onOpenDetail,
    onClosePanel, onSearch, onGoToDate, onDuplicate, onRSVP,
    onJoinMeeting, onShowHelp, onToggleWeekDays, onSettings,
    selectedEvent, currentView,
  ]);
}
