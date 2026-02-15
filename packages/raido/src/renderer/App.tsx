import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { TaskList } from './components/TaskList';
import { TaskDetail } from './components/TaskDetail';
import { SettingsModal } from './components/SettingsModal';
import { useTasks } from './hooks/useTasks';
import type { Task, AppConfig, ViewType } from '../shared/types';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType | string>('today');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const quickAddRef = useRef<HTMLInputElement>(null);

  const viewQuery = currentView === 'search' ? searchQuery : currentView === 'group' ? selectedGroup || undefined : undefined;
  const { tasks, loading, stats, groups, refresh } = useTasks(currentView as any, viewQuery);

  useEffect(() => {
    window.raido.getConfig().then(setAppConfig);
  }, []);

  useEffect(() => {
    const themePref = appConfig?.theme || 'dark';
    const apply = (resolved: 'dark' | 'light') => {
      document.documentElement.dataset.theme = resolved;
    };
    if (themePref === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mq.matches ? 'dark' : 'light');
      const handler = (e: MediaQueryListEvent) => apply(e.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      apply(themePref);
    }
  }, [appConfig?.theme]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        if (e.key === 'Escape') {
          (target as HTMLInputElement).blur();
          if (quickAddOpen) {
            setQuickAddOpen(false);
            setQuickAddTitle('');
          }
        }
        return;
      }

      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setQuickAddOpen(true);
        setTimeout(() => quickAddRef.current?.focus(), 50);
        return;
      }

      if (e.key === '1') setCurrentView('today');
      if (e.key === '2') setCurrentView('inbox');
      if (e.key === '3') setCurrentView('upcoming');
      if (e.key === '4') setCurrentView('logbook');

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = selectedTask ? tasks.findIndex(t => t.id === selectedTask.id) : -1;
        const next = tasks[idx + 1];
        if (next) setSelectedTask(next);
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = selectedTask ? tasks.findIndex(t => t.id === selectedTask.id) : tasks.length;
        const prev = tasks[idx - 1];
        if (prev) setSelectedTask(prev);
      }

      if (e.key === 'x' && selectedTask) {
        handleComplete(selectedTask.id);
      }

      if (e.key === 'r' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        refresh();
      }

      if (e.key === '/' || (e.key === 'f' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setCurrentView('search');
      }

      if (e.key === ',' && e.altKey) {
        e.preventDefault();
        setSettingsOpen(prev => !prev);
        return;
      }

      if (e.key === 'Escape') {
        if (settingsOpen) { setSettingsOpen(false); return; }
        setSelectedTask(null);
        if (quickAddOpen) {
          setQuickAddOpen(false);
          setQuickAddTitle('');
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedTask, tasks, quickAddOpen, settingsOpen, refresh]);

  const handleViewChange = useCallback((view: string) => {
    setCurrentView(view as ViewType);
    setSelectedTask(null);
    setSelectedGroup(null);
  }, []);

  const handleSelectGroup = useCallback((name: string) => {
    setCurrentView('group');
    setSelectedGroup(name);
    setSelectedTask(null);
  }, []);

  const handleComplete = useCallback(async (id: string) => {
    await window.raido.completeTask(id);
    setSelectedTask(prev => prev?.id === id ? null : prev);
    refresh();
  }, [refresh]);

  const handleUpdate = useCallback(async (id: string, updates: Partial<Task>) => {
    await window.raido.updateTask(id, updates);
    const updated = await window.raido.getTask(id);
    if (updated) {
      setSelectedTask(prev => prev?.id === id ? updated : prev);
    }
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(async (id: string) => {
    await window.raido.deleteTask(id);
    setSelectedTask(prev => prev?.id === id ? null : prev);
    refresh();
  }, [refresh]);

  const handleQuickAdd = useCallback(async () => {
    if (!quickAddTitle.trim()) return;
    let titleText = quickAddTitle.trim();

    // Auto-prepend group prefix when viewing a group
    if (currentView === 'group' && selectedGroup && !titleText.startsWith('[')) {
      titleText = `[${selectedGroup}] ${titleText}`;
    }

    const data: any = { title: titleText };

    if (currentView === 'today') {
      data.due_date = new Date().toISOString().split('T')[0];
    }

    await window.raido.createTask(data);
    setQuickAddTitle('');
    setQuickAddOpen(false);
    refresh();
  }, [quickAddTitle, currentView, selectedGroup, refresh]);

  const viewTitle = (() => {
    switch (currentView) {
      case 'today': return 'Today';
      case 'inbox': return 'Inbox';
      case 'upcoming': return 'Upcoming';
      case 'logbook': return 'Logbook';
      case 'search': return 'Search';
      case 'group': return selectedGroup || 'Group';
      default: return '';
    }
  })();

  return (
    <div className="h-screen flex bg-bg-primary">
      {/* Sidebar */}
      <div className="w-56 min-w-[200px] border-r border-border-subtle flex-shrink-0 titlebar-drag">
        <div className="titlebar-no-drag h-full">
          <Sidebar
            currentView={currentView}
            onViewChange={handleViewChange}
            stats={stats}
            groups={groups}
            selectedGroup={selectedGroup}
            onSelectGroup={handleSelectGroup}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Title bar */}
        <div className="titlebar-drag h-12 flex items-center px-4 bg-bg-secondary border-b border-border-subtle flex-shrink-0">
          <div className="flex-1" />
          <div className="titlebar-no-drag flex items-center gap-2">
            <button
              onClick={() => {
                setQuickAddOpen(true);
                setTimeout(() => quickAddRef.current?.focus(), 50);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors text-white hover:opacity-90 shadow-sm brand-gradient"
              title="New Task (N)"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Task
            </button>

            {currentView === 'search' ? (
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="bg-bg-primary border border-border-subtle rounded-md px-3 py-1.5 text-xs text-text-primary placeholder-text-muted outline-none w-48 focus:border-accent-primary/40"
                autoFocus
              />
            ) : (
              <button
                onClick={() => setCurrentView('search')}
                className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
                title="Search (/)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            )}

            <button
              onClick={refresh}
              className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
              title="Refresh"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
              title="Settings (⌥,)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Quick add bar */}
        {quickAddOpen && (
          <div className="px-4 py-2 bg-bg-secondary border-b border-border-subtle animate-slide-up">
            <div className="flex items-center gap-2">
              <input
                ref={quickAddRef}
                type="text"
                value={quickAddTitle}
                onChange={(e) => setQuickAddTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickAdd();
                  if (e.key === 'Escape') {
                    setQuickAddOpen(false);
                    setQuickAddTitle('');
                  }
                }}
                placeholder={currentView === 'group' && selectedGroup
                  ? `New task in [${selectedGroup}]...`
                  : 'What needs to be done?'}
                className="flex-1 bg-transparent border-none outline-none text-sm text-text-primary placeholder-text-muted"
                autoFocus
              />
              <button
                onClick={handleQuickAdd}
                className="px-3 py-1 rounded-md text-xs font-medium text-white brand-gradient hover:opacity-90 transition-opacity"
              >
                Add
              </button>
              <button
                onClick={() => { setQuickAddOpen(false); setQuickAddTitle(''); }}
                className="px-2 py-1 rounded-md text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 flex overflow-hidden">
          <div className="w-2/5 min-w-[300px] max-w-[500px] border-r border-border-subtle">
            <TaskList
              tasks={tasks}
              selectedId={selectedTask?.id || null}
              onSelect={setSelectedTask}
              onComplete={handleComplete}
              loading={loading}
              title={viewTitle}
            />
          </div>

          <TaskDetail
            task={selectedTask}
            onUpdate={handleUpdate}
            onComplete={handleComplete}
            onDelete={handleDelete}
          />
        </div>
      </div>

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
