import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { TaskList } from './components/TaskList';
import { TaskDetail } from './components/TaskDetail';
import { TodayDashboard } from './components/TodayDashboard';
import { PipelineView } from './components/PipelineView';
import { SettingsModal } from './components/SettingsModal';
import { NewTaskModal } from './components/NewTaskModal';
import { useTasks } from './hooks/useTasks';
import { UpdateBanner } from '@futhark/core/components/UpdateBanner';
import type { Task, AppConfig, ViewType } from '../shared/types';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType | string>('today');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listWidth, setListWidth] = useState(400);
  const resizing = useRef(false);

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
    if (!loading && tasks.length > 0 && !selectedTask && currentView !== 'pipeline') {
      setSelectedTask(tasks[0]);
    }
  }, [loading, tasks, selectedTask, currentView]);

  const openNewTask = useCallback(() => {
    setNewTaskOpen(true);
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startWidth = listWidth;
    const onMove = (me: MouseEvent) => {
      if (!resizing.current) return;
      const newWidth = Math.min(800, Math.max(250, startWidth + (me.clientX - startX)));
      setListWidth(newWidth);
    };
    const onUp = () => {
      resizing.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [listWidth]);

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
    const result = await window.raido.completeTask(id);
    if (result.spawned) {
      setSelectedTask(result.spawned);
    } else {
      setSelectedTask(prev => prev?.id === id ? null : prev);
    }
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        if (e.key === 'Escape') {
          (target as HTMLInputElement).blur();
        }
        return;
      }

      // ── Modifier shortcuts (processed before guard) ────────

      // Cmd+, or Option+, = Settings (macOS convention)
      if (e.key === ',' && (e.metaKey || e.altKey)) {
        e.preventDefault();
        setSettingsOpen(prev => !prev);
        return;
      }

      // Cmd+Shift+R = Refresh
      if (e.key === 'r' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        refresh();
        return;
      }

      // Cmd+F = Search
      if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCurrentView('search');
        return;
      }

      // Don't intercept single-key shortcuts when modifiers are held
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // ── Single-key shortcuts ───────────────────────────────

      switch (e.key.toLowerCase()) {
        case 'c':
          e.preventDefault();
          openNewTask();
          break;
        case 'n':
          e.preventDefault();
          openNewTask();
          break;
        case '/':
          e.preventDefault();
          setCurrentView('search');
          break;
        case 'j':
        case 'arrowdown': {
          e.preventDefault();
          const idx = selectedTask ? tasks.findIndex(t => t.id === selectedTask.id) : -1;
          const next = tasks[idx + 1];
          if (next) setSelectedTask(next);
          break;
        }
        case 'k':
        case 'arrowup': {
          e.preventDefault();
          const idx = selectedTask ? tasks.findIndex(t => t.id === selectedTask.id) : tasks.length;
          const prev = tasks[idx - 1];
          if (prev) setSelectedTask(prev);
          break;
        }
        case 'x':
          if (selectedTask) {
            e.preventDefault();
            handleComplete(selectedTask.id);
          }
          break;
        case '1': setCurrentView('today'); break;
        case '2': setCurrentView('inbox'); break;
        case '3': setCurrentView('upcoming'); break;
        case '4': setCurrentView('logbook'); break;
        case '5': setCurrentView('pipeline'); break;
        case '6': setCurrentView('deferred'); break;
        case 'escape':
          if (newTaskOpen) { setNewTaskOpen(false); break; }
          if (settingsOpen) { setSettingsOpen(false); break; }
          setSelectedTask(null);
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedTask, tasks, newTaskOpen, settingsOpen, refresh, openNewTask, handleComplete]);

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

  const newTaskDefaults = useCallback(() => {
    const defaults: any = {};
    if (currentView === 'today') {
      const d = new Date();
      defaults.due_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    if (currentView === 'group' && selectedGroup) {
      defaults.groupPrefix = selectedGroup;
    }
    return defaults;
  }, [currentView, selectedGroup]);

  const viewTitle = (() => {
    switch (currentView) {
      case 'today': return 'Today';
      case 'inbox': return 'Inbox';
      case 'upcoming': return 'Upcoming';
      case 'logbook': return 'Logbook';
      case 'deferred': return 'Deferred';
      case 'pipeline': return 'Pipeline';
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
            hubspotEnabled={appConfig?.hubspot_enabled || false}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Title bar */}
        <div className="titlebar-drag h-12 flex items-center px-4 bg-bg-secondary border-b border-border-subtle flex-shrink-0">
          <div className="titlebar-no-drag"><UpdateBanner api={window.raido} /></div>
          <div className="flex-1" />
          <div className="titlebar-no-drag flex items-center gap-2">
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
              title="Settings (⌘,)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          {/* Raidō rune — far right, click to create task */}
          <div className="titlebar-no-drag ml-3 flex items-center">
            <button
              onClick={openNewTask}
              className="p-0.5 rounded-md hover:opacity-80 transition-opacity"
              title="New Task (C)"
            >
              <svg className="w-5 h-5" viewBox="0 0 512 512" fill="none">
                <defs>
                  <linearGradient id="raido-title" x1="51.2" y1="460.8" x2="460.8" y2="51.2" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#8B5E3C"/>
                    <stop offset="1" stopColor="#D4A574"/>
                  </linearGradient>
                </defs>
                <rect x="25.6" y="25.6" width="460.8" height="460.8" rx="102.4" fill="url(#raido-title)"/>
                <path d="M198.2 130.5L198.2 381.5" stroke="#FFF8F0" strokeWidth="31.36" strokeLinecap="round" fill="none"/>
                <path d="M198.2 130.5L320.8 215.8L198.2 301.0" stroke="#FFF8F0" strokeWidth="31.36" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <path d="M198.2 301.0L320.8 381.5" stroke="#FFF8F0" strokeWidth="31.36" strokeLinecap="round" fill="none"/>
              </svg>
            </button>
          </div>
        </div>

        {/* New Task Modal */}
        {newTaskOpen && (
          <NewTaskModal
            defaults={newTaskDefaults()}
            onClose={() => setNewTaskOpen(false)}
            onCreate={async (data) => {
              const task = await window.raido.createTask(data);
              setNewTaskOpen(false);
              refresh();
              if (task) setSelectedTask(task);
            }}
          />
        )}

        {/* Content area */}
        <div className="flex-1 flex overflow-hidden">
          {currentView === 'today' ? (
            <>
              <div className="relative flex-shrink-0" style={{ width: listWidth }}>
                <TodayDashboard
                  tasks={tasks}
                  selectedId={selectedTask?.id || null}
                  onSelect={setSelectedTask}
                  onComplete={handleComplete}
                  onUpdate={handleUpdate}
                  calendarEnabled={appConfig?.calendar_enabled ?? true}
                  suggestionPinned={appConfig?.today_suggestion_pinned || false}
                  onToggleSuggestion={(pinned) => {
                    window.raido.setConfig({ today_suggestion_pinned: pinned } as any);
                    setAppConfig(prev => prev ? { ...prev, today_suggestion_pinned: pinned } : prev);
                  }}
                  hubspotEnabled={appConfig?.hubspot_enabled || false}
                  hubspotPortalId={appConfig?.hubspot_portal_id || ''}
                  hubspotOwnerId={appConfig?.hubspot_owner_id || ''}
                  hubspotPipelines={appConfig?.hubspot_pipelines || []}
                  hubspotExcludedStages={appConfig?.hubspot_excluded_stages || []}
                />
                <div
                  onMouseDown={handleResizeStart}
                  className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent-primary/30 active:bg-accent-primary/50 transition-colors z-10"
                />
              </div>
              <div className="w-px bg-border-subtle flex-shrink-0" />
              <TaskDetail
                task={selectedTask}
                onUpdate={handleUpdate}
                onComplete={handleComplete}
                onDelete={handleDelete}
              />
            </>
          ) : currentView === 'pipeline' ? (
            <PipelineView
              hubspotPortalId={appConfig?.hubspot_portal_id || ''}
              hubspotOwnerId={appConfig?.hubspot_owner_id || ''}
              hubspotPipelines={appConfig?.hubspot_pipelines || []}
              hubspotExcludedStages={appConfig?.hubspot_excluded_stages || []}
            />
          ) : (
            <>
              <div className="relative flex-shrink-0" style={{ width: listWidth }}>
                <TaskList
                  tasks={tasks}
                  selectedId={selectedTask?.id || null}
                  onSelect={setSelectedTask}
                  onComplete={handleComplete}
                  onUpdate={handleUpdate}
                  loading={loading}
                  title={viewTitle}
                />
                <div
                  onMouseDown={handleResizeStart}
                  className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent-primary/30 active:bg-accent-primary/50 transition-colors z-10"
                />
              </div>
              <div className="w-px bg-border-subtle flex-shrink-0" />
              <TaskDetail
                task={selectedTask}
                onUpdate={handleUpdate}
                onComplete={handleComplete}
                onDelete={handleDelete}
              />
            </>
          )}
        </div>
      </div>

      {settingsOpen && (
        <SettingsModal onClose={() => {
          setSettingsOpen(false);
          window.raido.getConfig().then(setAppConfig);
        }} />
      )}
    </div>
  );
}
