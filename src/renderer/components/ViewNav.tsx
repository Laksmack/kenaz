import React from 'react';
import type { ViewType, View } from '@shared/types';

interface Props {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  views: View[];
  counts?: Record<string, number>;
}

const NO_COUNT_IDS = new Set(['all', 'sent']);

export function ViewNav({ currentView, onViewChange, views, counts = {} }: Props) {
  // Pin 'all' to the end, everything else in original order
  const sorted = [
    ...views.filter((v) => v.id !== 'all'),
    ...views.filter((v) => v.id === 'all'),
  ];

  return (
    <nav className="flex items-center gap-1">
      {sorted.map((view) => {
        const count = counts[view.id];
        const showCount = count !== undefined && count > 0 && !NO_COUNT_IDS.has(view.id);

        return (
          <button
            key={view.id}
            onClick={() => onViewChange(view.id)}
            className={`
              titlebar-no-drag px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors
              ${currentView === view.id
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }
            `}
            title={view.shortcut ? `${view.name} (${view.shortcut})` : view.name}
          >
            {view.icon && <span className="mr-1">{view.icon}</span>}
            {view.name}
            {showCount && (
              <span className={`ml-1 text-[10px] font-semibold ${
                currentView === view.id ? 'text-accent-primary/70' : 'text-text-muted'
              }`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
