import React from 'react';
import type { TaskStats, TaskGroup } from '../../shared/types';
import { cn } from '../lib/utils';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  stats: TaskStats;
  groups: TaskGroup[];
  selectedGroup: string | null;
  onSelectGroup: (name: string) => void;
}

const NAV_ITEMS = [
  { id: 'today', name: 'Today', icon: '☀️', statKey: 'today' as const },
  { id: 'inbox', name: 'Inbox', icon: '📥', statKey: 'inbox' as const },
  { id: 'upcoming', name: 'Upcoming', icon: '📅' },
  { id: 'logbook', name: 'Logbook', icon: '📖' },
];

export function Sidebar({ currentView, onViewChange, stats, groups, selectedGroup, onSelectGroup }: SidebarProps) {
  const activeGroups = groups.filter(g => g.count > 0);

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      {/* Traffic light spacer */}
      <div className="h-12 flex-shrink-0" />

      {/* Nav items */}
      <nav className="px-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const count = item.statKey ? stats[item.statKey] : undefined;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                'sidebar-item w-full',
                isActive && 'active'
              )}
            >
              <span className="text-base w-6 text-center">{item.icon}</span>
              <span className="flex-1 text-left">{item.name}</span>
              {count !== undefined && count > 0 && (
                <span
                  className="text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
                  style={
                    item.id === 'today'
                      ? stats.overdue > 0
                        ? { background: 'color-mix(in srgb, var(--color-urgency) 15%, transparent)', color: 'var(--color-urgency)' }
                        : { background: 'color-mix(in srgb, var(--color-current) 15%, transparent)', color: 'var(--color-current)' }
                      : { color: 'rgb(var(--text-muted))' }
                  }
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      {activeGroups.length > 0 && (
        <>
          <div className="mx-4 my-3 border-t border-border-subtle" />

          {/* Groups */}
          <div className="px-4 mb-2">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Groups</span>
          </div>

          <nav className="px-3 space-y-0.5 overflow-y-auto flex-1 scrollbar-hide">
            {activeGroups.map((group) => {
              const isActive = currentView === 'group' && selectedGroup === group.name;
              return (
                <button
                  key={group.name}
                  onClick={() => onSelectGroup(group.name)}
                  className={cn(
                    'sidebar-item w-full',
                    isActive && 'active'
                  )}
                >
                  <span className="text-base w-6 text-center opacity-60">⌐</span>
                  <span className="flex-1 text-left truncate">{group.name}</span>
                  <span className="text-xs text-text-muted">{group.count}</span>
                </button>
              );
            })}
          </nav>
        </>
      )}

      {activeGroups.length === 0 && <div className="flex-1" />}

      {/* Raidō rune footer */}
      <div className="px-4 py-3 border-t border-border-subtle flex items-center gap-2">
        <svg className="w-5 h-5" viewBox="0 0 512 512" fill="none">
          <defs>
            <linearGradient id="raido-rune" x1="51.2" y1="460.8" x2="460.8" y2="51.2" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#8B5E3C"/>
              <stop offset="1" stopColor="#D4A574"/>
            </linearGradient>
          </defs>
          <rect x="25.6" y="25.6" width="460.8" height="460.8" rx="102.4" fill="url(#raido-rune)"/>
          <path d="M198.2 130.5L198.2 381.5" stroke="#FFF8F0" strokeWidth="31.36" strokeLinecap="round" fill="none"/>
          <path d="M198.2 130.5L320.8 215.8L198.2 301.0" stroke="#FFF8F0" strokeWidth="31.36" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <path d="M198.2 301.0L320.8 381.5" stroke="#FFF8F0" strokeWidth="31.36" strokeLinecap="round" fill="none"/>
        </svg>
        <span className="text-xs text-text-muted font-medium">Raidō</span>
      </div>
    </div>
  );
}
