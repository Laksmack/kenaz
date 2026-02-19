import React from 'react';
import type { Tab } from '../App';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  splitTabId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onSplit: (id: string) => void;
}

export function TabBar({ tabs, activeTabId, splitTabId, onActivate, onClose, onSplit }: TabBarProps) {
  return (
    <div className="flex items-center h-9 bg-bg-secondary border-b border-border-subtle px-1 gap-px flex-shrink-0 overflow-x-auto scrollbar-hide">
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId;
        const isSplit = tab.id === splitTabId;
        return (
          <div
            key={tab.id}
            onClick={() => onActivate(tab.id)}
            onDoubleClick={() => onSplit(tab.id)}
            className={`group flex items-center gap-1.5 px-3 h-7 rounded-md text-[11px] cursor-pointer transition-colors select-none max-w-[160px] ${
              isActive
                ? 'bg-bg-tertiary text-text-primary font-medium'
                : isSplit
                  ? 'bg-bg-hover/50 text-text-secondary'
                  : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover/50'
            }`}
          >
            {tab.isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-primary flex-shrink-0" />
            )}
            <span className="truncate">{tab.label}</span>
            {isSplit && (
              <span className="text-[9px] text-accent-primary flex-shrink-0">⫿</span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
              className="ml-auto p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-bg-primary/50 text-text-muted hover:text-text-primary transition-all flex-shrink-0"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
