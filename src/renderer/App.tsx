import React, { useState, useEffect, useCallback } from 'react';
import { EmailList } from './components/EmailList';
import { EmailView } from './components/EmailView';
import { Sidebar } from './components/Sidebar';
import { ComposeBar } from './components/ComposeBar';
import { ViewNav } from './components/ViewNav';
import { SearchBar } from './components/SearchBar';
import { AuthScreen } from './components/AuthScreen';
import { SettingsModal } from './components/SettingsModal';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useEmails } from './hooks/useEmails';
import type { ViewType, ComposeData, EmailThread } from '@shared/types';

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('inbox');
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeData, setComposeData] = useState<Partial<ComposeData> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Check auth on mount
  useEffect(() => {
    window.kenaz.gmailAuthStatus()
      .then((status: boolean) => setAuthenticated(status))
      .catch(() => setAuthenticated(false));
  }, []);

  const {
    threads,
    loading,
    refresh,
    archiveThread,
    labelThread,
    markRead,
  } = useEmails(currentView, searchQuery, authenticated === true);

  // Select first thread when list changes
  useEffect(() => {
    if (threads.length > 0 && !selectedThread) {
      setSelectedThread(threads[0]);
    }
  }, [threads]);

  const handleSelectThread = useCallback((thread: EmailThread) => {
    setSelectedThread(thread);
    if (thread.isUnread) {
      markRead(thread.id);
    }
  }, [markRead]);

  const handleArchive = useCallback(async () => {
    if (!selectedThread) return;
    await archiveThread(selectedThread.id);
    const idx = threads.findIndex((t) => t.id === selectedThread.id);
    const next = threads[idx + 1] || threads[idx - 1] || null;
    setSelectedThread(next);
  }, [selectedThread, threads, archiveThread]);

  const handleLabel = useCallback(async (label: string) => {
    if (!selectedThread) return;
    const hasLabel = selectedThread.labels.some((l) => l === label);
    if (hasLabel) {
      await labelThread(selectedThread.id, null, label);
    } else {
      await labelThread(selectedThread.id, label, null);
    }
    refresh();
  }, [selectedThread, labelThread, refresh]);

  const handleCompose = useCallback((data?: Partial<ComposeData>) => {
    setComposeData(data || {});
    setComposeOpen(true);
  }, []);

  const handleReply = useCallback(() => {
    if (!selectedThread) return;
    const lastMsg = selectedThread.messages[selectedThread.messages.length - 1];
    handleCompose({
      to: lastMsg.from.email,
      subject: selectedThread.subject.startsWith('Re:')
        ? selectedThread.subject
        : `Re: ${selectedThread.subject}`,
      replyToThreadId: selectedThread.id,
      replyToMessageId: lastMsg.id,
    });
  }, [selectedThread, handleCompose]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setSearchActive(!!query);
    if (query) {
      setCurrentView('search');
    }
  }, []);

  const handleViewChange = useCallback((view: ViewType) => {
    setCurrentView(view);
    setSelectedThread(null);
    setSearchActive(false);
    setSearchQuery('');
  }, []);

  // Navigate thread list
  const navigateList = useCallback((direction: 'up' | 'down') => {
    if (!selectedThread || threads.length === 0) return;
    const idx = threads.findIndex((t) => t.id === selectedThread.id);
    const nextIdx = direction === 'down' ? Math.min(idx + 1, threads.length - 1) : Math.max(idx - 1, 0);
    handleSelectThread(threads[nextIdx]);
  }, [selectedThread, threads, handleSelectThread]);

  useKeyboardShortcuts({
    onArchive: handleArchive,
    onPending: () => handleLabel('PENDING'),
    onFollowUp: () => handleLabel('FOLLOWUP'),
    onCompose: () => handleCompose(),
    onReply: handleReply,
    onNavigateUp: () => navigateList('up'),
    onNavigateDown: () => navigateList('down'),
    onSearch: () => setSearchActive(true),
    onEscape: () => {
      if (settingsOpen) setSettingsOpen(false);
      else if (composeOpen) setComposeOpen(false);
      else if (searchActive) { setSearchActive(false); setSearchQuery(''); }
      else setSelectedThread(null);
    },
    onRefresh: refresh,
    onSettings: () => setSettingsOpen(!settingsOpen),
    enabled: !composeOpen || settingsOpen,
  });

  // Auth screen
  if (authenticated === false) {
    return <AuthScreen onAuthenticated={() => setAuthenticated(true)} />;
  }

  if (authenticated === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-primary">
        <div className="text-text-secondary text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Title bar drag region */}
      <div className="titlebar-drag h-12 flex items-center px-20 bg-bg-secondary border-b border-border-subtle flex-shrink-0">
        <div className="titlebar-no-drag">
          <ViewNav currentView={currentView} onViewChange={handleViewChange} />
        </div>
        <div className="flex-1" /> {/* This space IS draggable */}
        <div className="titlebar-no-drag flex items-center gap-2">
          <SearchBar
            active={searchActive}
            query={searchQuery}
            onSearch={handleSearch}
            onActivate={() => setSearchActive(true)}
            onClose={() => { setSearchActive(false); setSearchQuery(''); }}
          />
          <button
            onClick={refresh}
            className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
            title="Refresh (Cmd+Shift+R)"
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

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Email List */}
        <div className="w-1/4 min-w-[280px] max-w-[400px] border-r border-border-subtle flex flex-col overflow-hidden">
          <EmailList
            threads={threads}
            selectedId={selectedThread?.id || null}
            loading={loading}
            onSelect={handleSelectThread}
            currentView={currentView}
          />
        </div>

        {/* Email Body */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <EmailView
            thread={selectedThread}
            onReply={handleReply}
            onArchive={handleArchive}
            onLabel={handleLabel}
          />
        </div>

        {/* HubSpot Sidebar */}
        <div className="w-1/4 min-w-[260px] max-w-[360px] border-l border-border-subtle overflow-hidden">
          <Sidebar
            thread={selectedThread}
          />
        </div>
      </div>

      {/* Compose Bar */}
      {composeOpen && (
        <ComposeBar
          initialData={composeData}
          onClose={() => setComposeOpen(false)}
          onSent={() => { setComposeOpen(false); refresh(); }}
        />
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
