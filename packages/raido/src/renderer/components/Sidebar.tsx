import React from 'react';
import type { Project, TaskStats } from '../../shared/types';
import { cn } from '../lib/utils';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  stats: TaskStats;
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
}

const NAV_ITEMS = [
  { id: 'today', name: 'Today', icon: '☀️', statKey: 'today' as const },
  { id: 'inbox', name: 'Inbox', icon: '📥', statKey: 'inbox' as const },
  { id: 'upcoming', name: 'Upcoming', icon: '📅' },
  { id: 'someday', name: 'Someday', icon: '💭' },
  { id: 'logbook', name: 'Logbook', icon: '📖' },
];

export function Sidebar({ currentView, onViewChange, stats, projects, selectedProjectId, onSelectProject }: SidebarProps) {
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
                <span className={cn(
                  'text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[20px] text-center',
                  item.id === 'today' && stats.overdue > 0 ? 'bg-accent-danger/15 text-accent-danger' : 'text-text-muted'
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-4 my-3 border-t border-border-subtle" />

      {/* Projects */}
      <div className="px-4 mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Projects</span>
        <button
          onClick={() => onViewChange('new-project')}
          className="text-text-muted hover:text-text-primary transition-colors"
          title="New Project"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <nav className="px-3 space-y-0.5 overflow-y-auto flex-1 scrollbar-hide">
        {projects.map((project) => {
          const isActive = currentView === 'project' && selectedProjectId === project.id;
          return (
            <button
              key={project.id}
              onClick={() => onSelectProject(project.id)}
              className={cn(
                'sidebar-item w-full',
                isActive && 'active'
              )}
            >
              <span className="text-base w-6 text-center">📁</span>
              <span className="flex-1 text-left truncate">{project.title}</span>
              {project.open_task_count !== undefined && project.open_task_count > 0 && (
                <span className="text-xs text-text-muted">{project.open_task_count}</span>
              )}
            </button>
          );
        })}
        {projects.length === 0 && (
          <div className="px-4 py-2 text-xs text-text-muted">No projects yet</div>
        )}
      </nav>

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
          <path d="M190 399.4L190 112.6" stroke="#FFF8F0" strokeWidth="35.84" strokeLinecap="round" fill="none"/>
          <path d="M190 112.6L330 210L190 307.4" stroke="#FFF8F0" strokeWidth="35.84" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <path d="M190 307.4L330 399.4" stroke="#FFF8F0" strokeWidth="35.84" strokeLinecap="round" fill="none"/>
        </svg>
        <span className="text-xs text-text-muted font-medium">Raidō</span>
      </div>
    </div>
  );
}
