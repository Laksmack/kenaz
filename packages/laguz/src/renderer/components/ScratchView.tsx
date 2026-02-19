import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '../lib/utils';

const STORAGE_KEY = 'laguz-scratch-tabs';
const MAX_TABS = 5;

interface ScratchTab {
  id: number;
  content: string;
}

function loadTabs(): ScratchTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [{ id: 1, content: '' }, { id: 2, content: '' }, { id: 3, content: '' }];
}

function saveTabs(tabs: ScratchTab[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
}

export function ScratchView() {
  const [tabs, setTabs] = useState<ScratchTab[]>(loadTabs);
  const [activeTab, setActiveTab] = useState(1);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savePath, setSavePath] = useState('');

  useEffect(() => { saveTabs(tabs); }, [tabs]);

  const currentTab = tabs.find(t => t.id === activeTab) || tabs[0];

  const updateContent = useCallback((content: string) => {
    setTabs(prev => prev.map(t => t.id === activeTab ? { ...t, content } : t));
  }, [activeTab]);

  const handleSaveToVault = useCallback(async () => {
    if (!savePath.trim() || !currentTab.content.trim()) return;
    let path = savePath.trim();
    if (!path.endsWith('.md')) path += '.md';
    try {
      await window.laguz.writeNote(path, currentTab.content);
      setSaveDialogOpen(false);
      setSavePath('');
    } catch (e) {
      console.error('Failed to save to vault:', e);
    }
  }, [savePath, currentTab]);

  return (
    <>
      {/* Tab bar (middle pane header) */}
      <div className="flex flex-col h-full">
        <div className="px-4 py-2 border-b border-border-subtle flex items-center gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-bg-tertiary text-text-primary'
                  : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
              )}
            >
              {tab.id}
            </button>
          ))}
          {tabs.length < MAX_TABS && (
            <button
              onClick={() => {
                const newId = Math.max(...tabs.map(t => t.id)) + 1;
                setTabs(prev => [...prev, { id: newId, content: '' }]);
                setActiveTab(newId);
              }}
              className="px-2 py-1.5 rounded-md text-xs text-text-muted hover:text-text-secondary hover:bg-bg-hover"
            >
              +
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={() => {
              setSavePath('scratch/' + new Date().toISOString().split('T')[0] + ' - scratch.md');
              setSaveDialogOpen(true);
            }}
            disabled={!currentTab.content.trim()}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-accent-primary hover:bg-bg-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Save to Vault
          </button>
        </div>

        {/* Textarea */}
        <div className="flex-1 overflow-hidden">
          <textarea
            value={currentTab.content}
            onChange={(e) => updateContent(e.target.value)}
            placeholder="Type here... markdown, notes, prompt drafts, anything."
            className="w-full h-full bg-transparent border-none outline-none text-sm text-text-primary resize-none p-4 leading-relaxed font-mono placeholder-text-muted"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Save dialog */}
      {saveDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bg-secondary border border-border-subtle rounded-xl p-5 w-96 shadow-2xl">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Save to Vault</h3>
            <input
              type="text"
              value={savePath}
              onChange={(e) => setSavePath(e.target.value)}
              placeholder="path/to/note.md"
              className="w-full bg-bg-primary border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-primary/40 mb-3"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveToVault();
                if (e.key === 'Escape') setSaveDialogOpen(false);
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSaveDialogOpen(false)}
                className="px-3 py-1.5 rounded-md text-xs text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveToVault}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-white brand-gradient"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
