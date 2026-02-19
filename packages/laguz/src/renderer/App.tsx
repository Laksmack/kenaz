import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ScratchView } from './components/ScratchView';
import { VaultView } from './components/VaultView';
import { AccountsView } from './components/AccountsView';
import { FolderView } from './components/FolderView';
import { SettingsModal } from './components/SettingsModal';
import type { ViewType, LaguzConfig, SelectedItem } from './types';

export default function App() {
  const [config, setConfig] = useState<LaguzConfig | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('scratch');
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [subfolders, setSubfolders] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Load config on mount
  useEffect(() => {
    window.laguz.getConfig().then((cfg) => {
      setConfig(cfg);
      loadSubfolders(cfg);
    });
  }, []);

  const loadSubfolders = useCallback(async (cfg: LaguzConfig) => {
    const grouped = cfg.sections.filter(s => s.type === 'grouped' && s.enabled);
    const results: Record<string, string[]> = {};
    await Promise.all(
      grouped.map(async (section) => {
        try {
          if (section.type === 'grouped') {
            results[section.id] = await window.laguz.getSubfolders(section.path);
          }
        } catch (e) {
          console.error(`Failed to load subfolders for ${section.id}:`, e);
          results[section.id] = [];
        }
      })
    );
    setSubfolders(results);
  }, []);

  const handleViewChange = useCallback((view: ViewType) => {
    setCurrentView(view);
    setSelectedItem(null);
    if (view === 'vault') setSearchQuery('');
  }, []);

  const handleSelectItem = useCallback((sectionId: string, value: string) => {
    if (!config) return;
    const section = config.sections.find(s => s.id === sectionId);
    if (!section) return;

    if (section.type === 'grouped') {
      setCurrentView('grouped');
    } else if (section.type === 'flat') {
      setCurrentView('flat');
    }
    setSelectedItem({ sectionId, value });
  }, [config]);

  const handleConfigSave = useCallback(async (newConfig: LaguzConfig) => {
    const saved = await window.laguz.saveConfig(newConfig);
    setConfig(saved);
    await loadSubfolders(saved);
  }, [loadSubfolders]);

  // Resolve what to render for grouped/flat views
  const getGroupedPath = (): string | null => {
    if (!config || !selectedItem) return null;
    const section = config.sections.find(s => s.id === selectedItem.sectionId);
    if (section?.type === 'grouped') return `${section.path}/${selectedItem.value}`;
    return null;
  };

  const getGroupedEntity = (): string | null => {
    if (!selectedItem) return null;
    return selectedItem.value;
  };

  const getFlatPath = (): string | null => {
    if (!selectedItem) return null;
    return selectedItem.value;
  };

  // ── Keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      // ⌘, for settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(p => !p);
        return;
      }

      if (isInput) {
        if (e.key === 'Escape') {
          (target as HTMLInputElement).blur();
          setSearchFocused(false);
        }
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case '1':
          e.preventDefault();
          handleViewChange('scratch');
          break;
        case '2':
          e.preventDefault();
          handleViewChange('vault');
          break;
        case '/':
          e.preventDefault();
          handleViewChange('vault');
          setTimeout(() => {
            searchRef.current?.focus();
            setSearchFocused(true);
          }, 50);
          break;
        case 'Escape':
          if (settingsOpen) {
            setSettingsOpen(false);
          } else {
            setSelectedItem(null);
            setSearchQuery('');
            setSearchFocused(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleViewChange, settingsOpen]);

  if (!config) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-primary">
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-bg-primary">
      {/* Sidebar */}
      <div className="w-56 min-w-[200px] border-r border-border-subtle flex-shrink-0 titlebar-drag">
        <div className="titlebar-no-drag h-full">
          <Sidebar
            config={config}
            currentView={currentView}
            onViewChange={handleViewChange}
            subfolders={subfolders}
            selectedItem={selectedItem}
            onSelectItem={handleSelectItem}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Title bar */}
        <div className="titlebar-drag h-12 flex items-center px-4 bg-bg-secondary border-b border-border-subtle flex-shrink-0">
          <div className="flex-1" />
          <div className="titlebar-no-drag flex items-center gap-2">
            {currentView === 'vault' ? (
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Search vault..."
                className="bg-bg-primary border border-border-subtle rounded-md px-3 py-1.5 text-xs text-text-primary placeholder-text-muted outline-none w-56 focus:border-accent-primary/40"
              />
            ) : (
              <button
                onClick={() => {
                  handleViewChange('vault');
                  setTimeout(() => searchRef.current?.focus(), 50);
                }}
                className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
                title="Search (/)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            )}
          </div>

          {/* Settings + Laguz rune */}
          <div className="titlebar-no-drag ml-3 flex items-center gap-1.5">
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
              title="Settings (⌘,)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={() => handleViewChange('scratch')}
              className="p-0.5 rounded-md hover:opacity-80 transition-opacity"
              title="New Scratch (1)"
            >
              <svg className="w-5 h-5" viewBox="0 0 512 512" fill="none">
                <defs>
                  <linearGradient id="laguz-title" x1="51.2" y1="460.8" x2="460.8" y2="51.2" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#1B4D5C"/>
                    <stop offset="1" stopColor="#5CB8A5"/>
                  </linearGradient>
                </defs>
                <rect x="25.6" y="25.6" width="460.8" height="460.8" rx="102.4" fill="url(#laguz-title)"/>
                <line x1="190" y1="399.4" x2="190" y2="160" stroke="#F0FFF8" strokeWidth="31.36" strokeLinecap="round"/>
                <path d="M190 160L320 256" stroke="#F0FFF8" strokeWidth="31.36" strokeLinecap="round" fill="none"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 flex overflow-hidden">
          {currentView === 'scratch' && <ScratchView />}
          {currentView === 'vault' && <VaultView searchQuery={searchQuery} />}
          {currentView === 'grouped' && (
            <AccountsView path={getGroupedPath()} entity={getGroupedEntity()} />
          )}
          {currentView === 'flat' && <FolderView path={getFlatPath()} />}
        </div>
      </div>

      {/* Settings modal */}
      {settingsOpen && (
        <SettingsModal
          config={config}
          onSave={handleConfigSave}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
