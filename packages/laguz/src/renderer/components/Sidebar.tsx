import React from 'react';
import { cn } from '../lib/utils';
import { formatName } from '../lib/formatName';
import type { ViewType, LaguzConfig, Section, SelectedItem } from '../types';

interface SidebarProps {
  config: LaguzConfig;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  subfolders: Record<string, string[]>;
  selectedItem: SelectedItem | null;
  onSelectItem: (sectionId: string, value: string) => void;
}

const BUILTIN_ICONS: Record<string, string> = {
  scratch: '📝',
  vault: '🗄',
};

export function Sidebar({ config, currentView, onViewChange, subfolders, selectedItem, onSelectItem }: SidebarProps) {
  const sections = config.sections.filter(s => s.enabled);
  const builtins = sections.filter(s => s.type === 'scratch' || s.type === 'vault');
  const custom = sections.filter(s => s.type !== 'scratch' && s.type !== 'vault');

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      <div className="h-12 flex-shrink-0" />

      {/* Built-in sections */}
      <nav className="px-3 space-y-0.5">
        {builtins.map(section => (
          <button
            key={section.id}
            onClick={() => onViewChange(section.type as ViewType)}
            className={cn('sidebar-item w-full', currentView === section.type && !selectedItem && 'active')}
          >
            <span className="text-base w-6 text-center">{BUILTIN_ICONS[section.type] || '📄'}</span>
            <span className="flex-1 text-left">{section.label}</span>
          </button>
        ))}
      </nav>

      {custom.length > 0 && (
        <>
          <div className="mx-4 my-3 border-t border-border-subtle" />

          <nav className="px-3 space-y-0.5 overflow-y-auto flex-1 scrollbar-hide">
            {custom.map(section => (
              <SectionBlock
                key={section.id}
                section={section}
                subfolders={subfolders[section.id] || []}
                currentView={currentView}
                selectedItem={selectedItem}
                onViewChange={onViewChange}
                onSelectItem={onSelectItem}
              />
            ))}
          </nav>
        </>
      )}

      {custom.length === 0 && <div className="flex-1" />}

      {/* Laguz rune footer */}
      <div className="px-4 py-3 border-t border-border-subtle flex items-center gap-2">
        <svg className="w-5 h-5" viewBox="0 0 512 512" fill="none">
          <defs>
            <linearGradient id="laguz-rune" x1="51.2" y1="460.8" x2="460.8" y2="51.2" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#1B4D5C"/>
              <stop offset="1" stopColor="#5CB8A5"/>
            </linearGradient>
          </defs>
          <rect x="25.6" y="25.6" width="460.8" height="460.8" rx="102.4" fill="url(#laguz-rune)"/>
          <line x1="190" y1="399.4" x2="190" y2="160" stroke="#F0FFF8" strokeWidth="31.36" strokeLinecap="round"/>
          <path d="M190 160L320 256" stroke="#F0FFF8" strokeWidth="31.36" strokeLinecap="round" fill="none"/>
        </svg>
        <span className="text-xs text-text-muted font-medium">Laguz</span>
      </div>
    </div>
  );
}

function SectionBlock({
  section,
  subfolders,
  currentView,
  selectedItem,
  onViewChange,
  onSelectItem,
}: {
  section: Section;
  subfolders: string[];
  currentView: ViewType;
  selectedItem: SelectedItem | null;
  onViewChange: (view: ViewType) => void;
  onSelectItem: (sectionId: string, value: string) => void;
}) {
  if (section.type === 'grouped') {
    return (
      <div>
        <div className="px-4 mt-3 mb-2">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {section.icon && <span className="mr-1.5">{section.icon}</span>}
            {section.label}
          </span>
        </div>
        {subfolders.map(name => {
          const isActive = currentView === 'grouped'
            && selectedItem?.sectionId === section.id
            && selectedItem?.value === name;
          return (
            <button
              key={name}
              onClick={() => onSelectItem(section.id, name)}
              className={cn('sidebar-item w-full', isActive && 'active')}
            >
              <span className="text-base w-6 text-center opacity-60">{section.icon || '📁'}</span>
              <span className="flex-1 text-left truncate">{formatName(name)}</span>
            </button>
          );
        })}
        {subfolders.length === 0 && (
          <div className="px-4 py-2 text-xs text-text-muted">No items found</div>
        )}
      </div>
    );
  }

  if (section.type === 'flat') {
    const isActive = currentView === 'flat'
      && selectedItem?.sectionId === section.id
      && selectedItem?.value === section.path;
    return (
      <button
        onClick={() => onSelectItem(section.id, section.path)}
        className={cn('sidebar-item w-full', isActive && 'active')}
      >
        <span className="text-base w-6 text-center">{section.icon || '📁'}</span>
        <span className="flex-1 text-left">{section.label}</span>
      </button>
    );
  }

  return null;
}
