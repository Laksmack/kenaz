import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '../lib/utils';

const STORAGE_KEY = 'laguz-scratch-tabs';
const MAX_TABS = 5;

interface ScratchTab {
  id: number;
  content: string;
  savedPath?: string;
}

type ScratchSearchMode = 'find' | 'replace' | 'regex';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unescapeReplacement(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r');
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
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [regexMode, setRegexMode] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { saveTabs(tabs); }, [tabs]);

  const currentTab = tabs.find(t => t.id === activeTab) || tabs[0];

  const updateContent = useCallback((content: string) => {
    setTabs(prev => prev.map(t => t.id === activeTab ? { ...t, content } : t));
  }, [activeTab]);

  const deleteCurrentTab = useCallback(() => {
    if (tabs.length <= 1) {
      setTabs([{ id: 1, content: '' }]);
      setActiveTab(1);
      return;
    }
    const idx = tabs.findIndex(t => t.id === activeTab);
    const next = tabs.filter(t => t.id !== activeTab);
    const newActive = next[Math.min(idx, next.length - 1)];
    setTabs(next);
    setActiveTab(newActive.id);
  }, [tabs, activeTab]);

  const openSaveDialog = useCallback(() => {
    const defaultPath = currentTab.savedPath
      || 'scratch/' + new Date().toISOString().split('T')[0] + ' - scratch.md';
    setSavePath(defaultPath);
    setSaveDialogOpen(true);
  }, [currentTab]);

  const handleSave = useCallback(async () => {
    if (!currentTab.content.trim()) return;
    if (currentTab.savedPath) {
      try {
        await window.laguz.writeFile(currentTab.savedPath, currentTab.content);
        setSaveStatus('Saved');
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (e) {
        console.error('Failed to save:', e);
      }
    } else {
      openSaveDialog();
    }
  }, [currentTab, openSaveDialog]);

  const handleSaveToPath = useCallback(async () => {
    if (!savePath.trim() || !currentTab.content.trim()) return;
    const path = savePath.trim();
    try {
      await window.laguz.writeFile(path, currentTab.content);
      setTabs(prev => prev.map(t => t.id === activeTab ? { ...t, savedPath: path } : t));
      setSaveDialogOpen(false);
      setSavePath('');
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (e) {
      console.error('Failed to save:', e);
    }
  }, [savePath, currentTab, activeTab]);

  const openSearchPanel = useCallback((mode: ScratchSearchMode = 'find') => {
    setSearchOpen(true);
    setReplaceOpen(mode !== 'find');
    if (mode === 'regex') setRegexMode(true);
    setSearchStatus(null);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

  const makeSearchRegex = useCallback((): RegExp | null => {
    if (!searchQuery) return null;
    try {
      const source = regexMode ? searchQuery : escapeRegExp(searchQuery);
      return new RegExp(source, caseSensitive ? 'g' : 'gi');
    } catch {
      return null;
    }
  }, [searchQuery, regexMode, caseSensitive]);

  const findAndSelect = useCallback((direction: 1 | -1 = 1): boolean => {
    const textarea = textareaRef.current;
    const regex = makeSearchRegex();
    if (!textarea || !regex) return false;

    const text = currentTab.content;
    const matches: Array<{ start: number; end: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length });
      if (match[0].length === 0) regex.lastIndex++;
    }

    if (matches.length === 0) {
      setSearchStatus('No matches');
      return false;
    }

    const anchor = direction > 0 ? textarea.selectionEnd : textarea.selectionStart;
    let target = matches[0];

    if (direction > 0) {
      target = matches.find((m) => m.start > anchor) ?? matches[0];
    } else {
      target = [...matches].reverse().find((m) => m.end < anchor) ?? matches[matches.length - 1];
    }

    textarea.focus();
    textarea.setSelectionRange(target.start, target.end);
    setSearchStatus(null);
    return true;
  }, [currentTab.content, makeSearchRegex]);

  const replaceCurrent = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || !searchQuery) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = currentTab.content.slice(start, end);
    const source = regexMode ? searchQuery : escapeRegExp(searchQuery);
    let oneMatch: RegExp;
    try {
      oneMatch = new RegExp(`^(?:${source})$`, caseSensitive ? '' : 'i');
    } catch {
      setSearchStatus('Invalid regex');
      return;
    }

    if (!oneMatch.test(selected)) {
      if (!findAndSelect(1)) setSearchStatus('No matches');
      return;
    }

    const replacement = selected.replace(oneMatch, unescapeReplacement(replaceQuery));
    const next = currentTab.content.slice(0, start) + replacement + currentTab.content.slice(end);
    updateContent(next);
    setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = start + replacement.length;
      el.focus();
      el.setSelectionRange(pos, pos);
      findAndSelect(1);
    }, 0);
  }, [currentTab.content, searchQuery, regexMode, caseSensitive, replaceQuery, findAndSelect, updateContent]);

  const replaceAll = useCallback((onlySelection = false) => {
    const textarea = textareaRef.current;
    const regex = makeSearchRegex();
    if (!textarea || !regex) {
      if (searchQuery) setSearchStatus('Invalid regex');
      return;
    }

    const replacement = unescapeReplacement(replaceQuery);
    const text = currentTab.content;
    let start = 0;
    let end = text.length;
    if (onlySelection) {
      start = textarea.selectionStart;
      end = textarea.selectionEnd;
      if (start === end) {
        setSearchStatus('Select a block first');
        return;
      }
    }

    const before = text.slice(0, start);
    const target = text.slice(start, end);
    const after = text.slice(end);
    const count = (target.match(regex) || []).length;
    if (count === 0) {
      setSearchStatus('No matches');
      return;
    }

    const replaced = target.replace(regex, replacement);
    updateContent(before + replaced + after);
    setSearchStatus(`Replaced ${count} match${count === 1 ? '' : 'es'}`);
  }, [currentTab.content, makeSearchRegex, replaceQuery, updateContent, searchQuery]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        openSearchPanel('replace');
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        openSearchPanel('regex');
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        openSearchPanel('find');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
        e.preventDefault();
        deleteCurrentTab();
      }
      if (e.key === 'Escape' && searchOpen) {
        e.preventDefault();
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, deleteCurrentTab, openSearchPanel, searchOpen]);

  useEffect(() => {
    const handler = (event: Event) => {
      const mode = (event as CustomEvent<{ mode?: ScratchSearchMode }>).detail?.mode || 'find';
      openSearchPanel(mode);
    };
    window.addEventListener('laguz:scratch-search', handler as EventListener);
    return () => window.removeEventListener('laguz:scratch-search', handler as EventListener);
  }, [openSearchPanel]);

  return (
    <>
      <div className="flex flex-col h-full flex-1">
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
              title="New tab"
            >
              +
            </button>
          )}
          <button
            onClick={deleteCurrentTab}
            className="px-1.5 py-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-bg-hover transition-colors"
            title="Delete tab (⌘⌫)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
          <div className="flex-1" />
          {saveStatus && (
            <span className="text-xs text-accent-primary mr-2">{saveStatus}</span>
          )}
          <button
            onClick={handleSave}
            disabled={!currentTab.content.trim()}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-accent-primary hover:bg-bg-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Save (⌘S)"
          >
            Save
          </button>
          <button
            onClick={openSaveDialog}
            disabled={!currentTab.content.trim()}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-text-secondary hover:bg-bg-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Save As…"
          >
            Save As…
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          {searchOpen && (
            <div className="px-3 py-2 border-b border-border-subtle bg-bg-secondary/80 flex flex-wrap items-center gap-2">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    findAndSelect(e.shiftKey ? -1 : 1);
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setSearchOpen(false);
                  }
                }}
                placeholder={regexMode ? 'Find (regex)...' : 'Find...'}
                className="bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary/40 min-w-[180px]"
              />
              {replaceOpen && (
                <input
                  type="text"
                  value={replaceQuery}
                  onChange={(e) => setReplaceQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      replaceCurrent();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setSearchOpen(false);
                    }
                  }}
                  placeholder="Replace... (use \\n for newline)"
                  className="bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary/40 min-w-[220px]"
                />
              )}
              <button onClick={() => findAndSelect(-1)} className="px-2 py-1 rounded text-[10px] border border-border-subtle hover:bg-bg-hover">Prev</button>
              <button onClick={() => findAndSelect(1)} className="px-2 py-1 rounded text-[10px] border border-border-subtle hover:bg-bg-hover">Next</button>
              <button
                onClick={() => {
                  setReplaceOpen((prev) => !prev);
                  setSelectionOnly(false);
                }}
                className="px-2 py-1 rounded text-[10px] border border-border-subtle hover:bg-bg-hover"
              >
                {replaceOpen ? 'Hide Replace' : 'Replace...'}
              </button>
              {replaceOpen && (
                <>
                  <button onClick={replaceCurrent} className="px-2 py-1 rounded text-[10px] border border-border-subtle hover:bg-bg-hover">Replace</button>
                  <button onClick={() => replaceAll(selectionOnly)} className="px-2 py-1 rounded text-[10px] border border-border-subtle hover:bg-bg-hover">Replace All</button>
                  <button onClick={() => replaceAll(true)} className="px-2 py-1 rounded text-[10px] border border-border-subtle hover:bg-bg-hover" title="Replace all matches in currently selected block">
                    Replace in Selection
                  </button>
                </>
              )}
              <label className="text-[10px] text-text-muted flex items-center gap-1">
                <input type="checkbox" checked={regexMode} onChange={(e) => setRegexMode(e.target.checked)} />
                Regex
              </label>
              <label className="text-[10px] text-text-muted flex items-center gap-1">
                <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
                Case
              </label>
              {replaceOpen && (
                <label className="text-[10px] text-text-muted flex items-center gap-1">
                  <input type="checkbox" checked={selectionOnly} onChange={(e) => setSelectionOnly(e.target.checked)} />
                  Selection only
                </label>
              )}
              <button onClick={() => setSearchOpen(false)} className="px-2 py-1 rounded text-[10px] border border-border-subtle hover:bg-bg-hover ml-auto">Close</button>
              {searchStatus && <span className="text-[10px] text-text-muted">{searchStatus}</span>}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={currentTab.content}
            onChange={(e) => updateContent(e.target.value)}
            placeholder="Type here... markdown, notes, prompt drafts, anything."
            className="w-full h-full bg-transparent border-none outline-none text-sm text-text-primary resize-none p-4 leading-relaxed font-mono placeholder-text-muted"
            spellCheck={false}
          />
        </div>

        <div className="h-6 flex items-center px-3 gap-4 border-t border-border-subtle bg-bg-secondary text-[10px] text-text-muted flex-shrink-0 select-none">
          <span>{currentTab.savedPath || 'Unsaved scratch'}</span>
          <div className="flex-1" />
          <button onClick={() => openSearchPanel('find')} className="px-2 py-0.5 rounded border border-border-subtle hover:text-text-primary hover:border-accent-primary/40">Find</button>
          <button onClick={() => openSearchPanel('replace')} className="px-2 py-0.5 rounded border border-border-subtle hover:text-text-primary hover:border-accent-primary/40">Replace</button>
          <button onClick={() => openSearchPanel('regex')} className="px-2 py-0.5 rounded border border-border-subtle hover:text-text-primary hover:border-accent-primary/40">Regex</button>
          <span>{currentTab.content.trim() ? `${currentTab.content.trim().split(/\s+/).length} words` : ''}</span>
        </div>
      </div>

      {saveDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bg-secondary border border-border-subtle rounded-xl p-5 w-96 shadow-2xl">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Save As</h3>
            <p className="text-[11px] text-text-muted mb-2">Vault-relative path or absolute path (/Users/...)</p>
            <input
              type="text"
              value={savePath}
              onChange={(e) => setSavePath(e.target.value)}
              placeholder="scratch/my-note.md  or  /Users/me/file.txt"
              className="w-full bg-bg-primary border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-primary/40 mb-3"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveToPath();
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
                onClick={handleSaveToPath}
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
