import React from 'react';
import type { ViewType } from '@shared/types';
import { VIEWS } from '@shared/types';

interface Props {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

const VIEW_ICONS: Record<ViewType, string> = {
  inbox: '📥',
  pending: '⏳',
  followup: '✓',
  starred: '⭐',
  sent: '📤',
  all: '📬',
  search: '🔍',
};

export function ViewNav({ currentView, onViewChange }: Props) {
  return (
    <nav className="flex items-center gap-1">
      {VIEWS.map((view) => (
        <button
          key={view.type}
          onClick={() => onViewChange(view.type)}
          className={`
            titlebar-no-drag px-3 py-1.5 rounded-md text-xs font-medium transition-colors
            ${currentView === view.type
              ? 'bg-accent-primary/20 text-accent-primary'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
            }
          `}
          title={view.shortcut ? `${view.label} (${view.shortcut})` : view.label}
        >
          <span className="mr-1">{VIEW_ICONS[view.type]}</span>
          {view.label}
        </button>
      ))}
    </nav>
  );
}
