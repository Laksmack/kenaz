import { useEffect } from 'react';

interface ShortcutHandlers {
  onArchive: () => void;
  onPending: () => void;
  onFollowUp: () => void;
  onStar: () => void;
  onForward: () => void;
  onCompose: () => void;
  onReply: () => void;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onSearch: () => void;
  onEscape: () => void;
  onRefresh: () => void;
  onSettings: () => void;
  enabled: boolean;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    if (!handlers.enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        if (e.key === 'Escape') {
          handlers.onEscape();
        }
        return;
      }

      // Option+, = settings
      if (e.altKey && e.key === ',') {
        e.preventDefault();
        handlers.onSettings();
        return;
      }

      // Cmd+, = settings (macOS convention)
      if (e.metaKey && e.key === ',') {
        e.preventDefault();
        handlers.onSettings();
        return;
      }

      // Cmd+Shift+R = refresh
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'r') {
        e.preventDefault();
        handlers.onRefresh();
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'e':
        case 'd':
          e.preventDefault();
          handlers.onArchive();
          break;
        case 'p':
          e.preventDefault();
          handlers.onPending();
          break;
        case 'f':
          e.preventDefault();
          handlers.onForward();
          break;
        case 't':
          e.preventDefault();
          handlers.onFollowUp();
          break;
        case 's':
          e.preventDefault();
          handlers.onStar();
          break;
        case 'c':
          e.preventDefault();
          handlers.onCompose();
          break;
        case 'r':
        case 'enter':
          e.preventDefault();
          handlers.onReply();
          break;
        case 'j':
          e.preventDefault();
          handlers.onNavigateDown();
          break;
        case 'k':
          e.preventDefault();
          handlers.onNavigateUp();
          break;
        case '/':
          e.preventDefault();
          handlers.onSearch();
          break;
        case 'escape':
          e.preventDefault();
          handlers.onEscape();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
