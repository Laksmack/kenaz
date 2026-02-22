import React, { useState, useCallback } from 'react';
import { cn } from '../lib/utils';
import { formatName } from '../lib/formatName';
import type { ViewType, LaguzConfig, Section, SelectedItem, NoteSummary } from '../types';

interface SidebarProps {
  config: LaguzConfig;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  subfolders: Record<string, string[]>;
  selectedItem: SelectedItem | null;
  onSelectItem: (sectionId: string, value: string) => void;
  onFolderNavigate: (folderName: string) => void;
  onOpenFile: (path: string) => void;
  contextFolder: string | null;
}

const BUILTIN_ICONS: Record<string, string> = {
  scratch: '📝',
  vault: '🗄',
};

export function Sidebar({ config, currentView, onViewChange, subfolders, selectedItem, onSelectItem, onFolderNavigate, onOpenFile, contextFolder }: SidebarProps) {
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

      <div className="mx-4 my-3 border-t border-border-subtle flex-shrink-0" />

      {/* Scrollable area: custom sections + vault folder tree */}
      <nav className="px-3 overflow-y-auto flex-1 scrollbar-hide space-y-0.5">
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

        {custom.length > 0 && (
          <div className="mx-1 my-3 border-t border-border-subtle" />
        )}

        <VaultFolderTree
          currentView={currentView}
          contextFolder={contextFolder}
          onFolderNavigate={onFolderNavigate}
          onOpenFile={onOpenFile}
        />
      </nav>

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

// ── Vault Folder Tree ───────────────────────────────────────────

function VaultFolderTree({ currentView, contextFolder, onFolderNavigate, onOpenFile }: {
  currentView: ViewType;
  contextFolder: string | null;
  onFolderNavigate: (folderName: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const [folders, setFolders] = useState<Array<{ name: string; path: string }> | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [folderNotes, setFolderNotes] = useState<Record<string, NoteSummary[]>>({});
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
  const [treeOpen, setTreeOpen] = useState(false);

  const loadTopLevel = useCallback(() => {
    if (folders !== null) return;
    window.laguz.getVaultFolders().then(f => {
      setFolders(f.filter(folder => !folder.name.startsWith('_')));
    }).catch(console.error);
  }, [folders]);

  const toggleTree = useCallback(() => {
    const next = !treeOpen;
    setTreeOpen(next);
    if (next) loadTopLevel();
  }, [treeOpen, loadTopLevel]);

  const toggleFolder = useCallback((folderPath: string, folderName: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
        if (!folderNotes[folderPath]) {
          setLoadingFolders(prev2 => new Set(prev2).add(folderPath));
          window.laguz.getFolderNotes(folderPath).then(notes => {
            setFolderNotes(prev2 => ({ ...prev2, [folderPath]: notes }));
            setLoadingFolders(prev2 => { const s = new Set(prev2); s.delete(folderPath); return s; });
          }).catch(() => {
            setLoadingFolders(prev2 => { const s = new Set(prev2); s.delete(folderPath); return s; });
          });
        }
      }
      return next;
    });
  }, [folderNotes]);

  return (
    <div>
      <button onClick={toggleTree} className="sidebar-item w-full">
        <svg className={`w-3 h-3 text-text-muted transition-transform flex-shrink-0 ${treeOpen ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-base w-5 text-center opacity-60">🗂</span>
        <span className="flex-1 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Folders</span>
      </button>

      {treeOpen && folders && (
        <div className="space-y-0.5 mt-0.5">
          {folders.map(folder => {
            const isActive = currentView === 'context' && contextFolder === folder.name;
            const isExpanded = expanded.has(folder.path);
            const notes = folderNotes[folder.path];
            const isLoading = loadingFolders.has(folder.path);

            return (
              <div key={folder.path}>
                <div className="flex items-center">
                  <button
                    onClick={() => toggleFolder(folder.path, folder.name)}
                    className="p-1 rounded hover:bg-bg-hover text-text-muted flex-shrink-0"
                  >
                    <svg className={`w-2.5 h-2.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onFolderNavigate(folder.name)}
                    className={cn('sidebar-item flex-1 min-w-0', isActive && 'active')}
                  >
                    <span className="opacity-50 text-xs">📁</span>
                    <span className="truncate text-left">{formatName(folder.name)}</span>
                  </button>
                </div>

                {isExpanded && (
                  <div className="ml-5">
                    {isLoading && (
                      <div className="px-3 py-1 text-xs text-text-muted">Loading...</div>
                    )}
                    {notes && notes.length === 0 && (
                      <div className="px-3 py-1 text-xs text-text-muted">Empty</div>
                    )}
                    {notes && notes.map(note => (
                      <button
                        key={note.id}
                        onClick={() => onOpenFile(note.path)}
                        className="sidebar-item w-full"
                        title={note.path}
                      >
                        <span className="opacity-40 text-xs">
                          {note.type === 'PDF' ? '📄' : '📝'}
                        </span>
                        <span className="truncate text-left text-xs">{note.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {treeOpen && folders === null && (
        <div className="px-4 py-2 text-xs text-text-muted">Loading folders...</div>
      )}
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
  const [collapsed, setCollapsed] = useState(false);

  if (section.type === 'grouped') {
    return (
      <div>
        <button onClick={() => setCollapsed(c => !c)} className="sidebar-item w-full mt-2 mb-1">
          <svg className={`w-3 h-3 text-text-muted transition-transform flex-shrink-0 ${collapsed ? '' : 'rotate-90'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex-1 text-left">
            {section.icon && <span className="mr-1.5">{section.icon}</span>}
            {section.label}
          </span>
          <span className="text-[10px] text-text-muted">{subfolders.length}</span>
        </button>
        {!collapsed && (
          <>
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
          </>
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
