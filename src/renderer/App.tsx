import React, { useState, useEffect, useCallback, useRef } from 'react';
import { EmailList } from './components/EmailList';
import { EmailView } from './components/EmailView';
import { Sidebar } from './components/Sidebar';
import { ComposeBar } from './components/ComposeBar';
import { ViewNav } from './components/ViewNav';
import { SearchBar } from './components/SearchBar';
import { AuthScreen } from './components/AuthScreen';
import { SettingsModal } from './components/SettingsModal';
import { AdvancedSearch } from './components/AdvancedSearch';
import { UndoToast } from './components/UndoToast';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useEmails } from './hooks/useEmails';
import type { ViewType, ComposeData, SendEmailPayload, EmailThread, AppConfig, View, Rule } from '@shared/types';

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('inbox');
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeData, setComposeData] = useState<Partial<ComposeData> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined);
  const [prefillRule, setPrefillRule] = useState<Partial<Rule> | undefined>(undefined);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [views, setViews] = useState<View[]>([]);

  // Check auth on mount, load config, user email, and views
  useEffect(() => {
    window.kenaz.gmailAuthStatus()
      .then((status: boolean) => {
        setAuthenticated(status);
        if (status) {
          window.kenaz.getUserEmail().then(setUserEmail);
        }
      })
      .catch(() => setAuthenticated(false));
    window.kenaz.getConfig().then(setAppConfig);
    window.kenaz.listViews().then(setViews);
  }, []);

  const {
    threads,
    loading,
    refresh,
    archiveThread,
    labelThread,
    markRead,
  } = useEmails(currentView, searchQuery, authenticated === true, views);

  // ── View counts (background fetch) ──────────────────────
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const prevUnreadIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (authenticated !== true || views.length === 0) return;

    const fetchCounts = async () => {
      const counts: Record<string, number> = {};
      // Fetch counts for each view in parallel (skip 'all', 'sent', 'search')
      await Promise.all(
        views
          .filter((v) => v.id !== 'all' && v.id !== 'sent')
          .map(async (v) => {
            try {
              const result = await window.kenaz.fetchThreads(v.query || 'in:inbox', 50);
              counts[v.id] = result.length;
            } catch {
              counts[v.id] = 0;
            }
          })
      );
      setViewCounts(counts);

      // Dock badge: unread inbox count
      const inboxCount = counts['inbox'] || 0;
      window.kenaz.setBadge(inboxCount);
    };

    fetchCounts();
    // Refresh counts every 60 seconds
    const interval = setInterval(fetchCounts, 60000);
    return () => clearInterval(interval);
  }, [authenticated, views]);

  // ── Notifications for new unread mail ──────────────────
  useEffect(() => {
    if (currentView !== 'inbox') return;
    const unreadThreads = threads.filter((t) => t.isUnread);
    const currentIds = new Set(unreadThreads.map((t) => t.id));

    // Find genuinely new unread threads
    const newThreads = unreadThreads.filter((t) => !prevUnreadIds.current.has(t.id));

    // Only notify if we had a previous baseline (skip first load)
    if (prevUnreadIds.current.size > 0 && newThreads.length > 0) {
      const myEmail = userEmail.toLowerCase();
      for (const t of newThreads.slice(0, 3)) { // cap at 3 notifications
        // Skip notifications for threads where the latest message is from ourselves
        const lastMsg = t.messages[t.messages.length - 1];
        if (lastMsg && lastMsg.from.email.toLowerCase() === myEmail) continue;

        window.kenaz.notify(
          t.from.name || t.from.email,
          t.subject || t.snippet || 'New email'
        );
      }
    }

    prevUnreadIds.current = currentIds;
  }, [threads, currentView, userEmail]);

  // Also update counts when threads change (user actions)
  useEffect(() => {
    if (currentView && currentView !== 'search' && currentView !== 'all') {
      setViewCounts((prev) => ({ ...prev, [currentView]: threads.length }));
    }
    // Update dock badge for inbox
    if (currentView === 'inbox') {
      window.kenaz.setBadge(threads.length);
    }
  }, [threads, currentView]);

  // Select first thread when list changes
  useEffect(() => {
    if (threads.length > 0 && !selectedThread) {
      setSelectedThread(threads[0]);
    }
  }, [threads]);

  const handleSelectThread = useCallback(async (thread: EmailThread) => {
    // In drafts view, open the draft in compose instead of viewing it
    if (currentView === 'drafts') {
      try {
        // List drafts to find the one matching this thread
        const drafts = await window.kenaz.listDrafts();
        const draft = drafts.find((d: any) => d.threadId === thread.id);
        if (draft) {
          const draftDetail = await window.kenaz.getDraft(draft.id);
          setComposeData({
            to: draftDetail.to,
            cc: draftDetail.cc,
            bcc: draftDetail.bcc,
            subject: draftDetail.subject,
            bodyMarkdown: draftDetail.body,
            replyToThreadId: draftDetail.threadId || undefined,
            draftId: draftDetail.id,
          });
          setComposeOpen(true);
          return;
        }
      } catch (e) {
        console.error('Failed to load draft:', e);
      }
    }

    setSelectedThread(thread);
    if (thread.isUnread) {
      markRead(thread.id);
    }
  }, [markRead, currentView]);

  // Collect all label names that back a view (e.g. PENDING, TODO, custom)
  const getManagedLabels = useCallback(() => {
    return views
      .map((v) => v.query.match(/^label:(\S+)$/))
      .filter(Boolean)
      .map((m) => m![1]);
  }, [views]);

  const handleArchive = useCallback(async () => {
    if (!selectedThread) return;

    // In drafts view, delete the draft instead of archiving
    if (currentView === 'drafts') {
      try {
        const drafts = await window.kenaz.listDrafts();
        const draft = drafts.find((d: any) => d.threadId === selectedThread.id);
        if (draft) {
          await window.kenaz.deleteDraft(draft.id);
        }
      } catch (e) {
        console.error('Failed to delete draft:', e);
      }
      const idx = threads.findIndex((t) => t.id === selectedThread.id);
      const next = threads[idx + 1] || threads[idx - 1] || null;
      setSelectedThread(next);
      setTimeout(() => refresh(), 500);
      return;
    }

    // Remove ALL Kenaz-managed labels (labels backing any view) so the thread
    // cleanly disappears from Inbox, Pending, Todo, and any custom views.
    // We don't filter by thread labels because thread.labels uses internal IDs
    // (e.g. "Label_34") while view queries use display names (e.g. "TODO").
    // The server-side modifyLabels resolves names→IDs and is safe to call even
    // if the label isn't on the thread.
    const managedLabels = views
      .map((v) => v.query.match(/^label:(\S+)$/))
      .filter(Boolean)
      .map((m) => m![1]);

    for (const label of managedLabels) {
      labelThread(selectedThread.id, null, label);
    }

    await archiveThread(selectedThread.id);
    const idx = threads.findIndex((t) => t.id === selectedThread.id);
    const next = threads[idx + 1] || threads[idx - 1] || null;
    setSelectedThread(next);
  }, [selectedThread, threads, archiveThread, labelThread, currentView, views, refresh]);

  const handleLabel = useCallback(async (label: string) => {
    if (!selectedThread) return;
    const hasLabel = selectedThread.labels.some((l) => l === label);
    if (hasLabel) {
      // Toggle off: remove the label (optimistic update happens inside labelThread)
      labelThread(selectedThread.id, null, label);
    } else {
      // Toggle on: add the label, remove other managed labels, and archive
      const idx = threads.findIndex((t) => t.id === selectedThread.id);
      const next = threads[idx + 1] || threads[idx - 1] || null;
      setSelectedThread(next);
      // Remove other managed labels (e.g. pressing T while in Pending removes PENDING)
      for (const managed of getManagedLabels()) {
        if (managed !== label) {
          labelThread(selectedThread.id, null, managed);
        }
      }
      labelThread(selectedThread.id, label, null);
      archiveThread(selectedThread.id);
    }
    // Delayed refresh to sync with server after API calls have time to land
    setTimeout(() => refresh(), 2000);
  }, [selectedThread, threads, labelThread, archiveThread, getManagedLabels, refresh]);

  const handleStar = useCallback(async () => {
    if (!selectedThread) return;
    const isStarred = selectedThread.labels.includes('STARRED');
    if (isStarred) {
      await labelThread(selectedThread.id, null, 'STARRED');
    } else {
      await labelThread(selectedThread.id, 'STARRED', null);
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
    const dateStr = new Date(lastMsg.date).toLocaleString();
    const senderStr = lastMsg.from.name
      ? `${lastMsg.from.name} <${lastMsg.from.email}>`
      : lastMsg.from.email;
    // Quote the original plain text, prefixing each line with >
    const quotedBody = (lastMsg.bodyText || '')
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');

    // Reply All: collect all recipients, excluding self
    const me = userEmail.toLowerCase();
    const allTo = new Set<string>();
    const allCc = new Set<string>();

    // The original sender goes in To (unless it's us)
    if (lastMsg.from.email.toLowerCase() !== me) {
      allTo.add(lastMsg.from.email);
    }
    // Other To recipients (excluding self) go in To
    for (const t of lastMsg.to) {
      if (t.email.toLowerCase() !== me) allTo.add(t.email);
    }
    // CC recipients (excluding self) stay in CC
    for (const c of lastMsg.cc) {
      if (c.email.toLowerCase() !== me) allCc.add(c.email);
    }

    handleCompose({
      to: Array.from(allTo).join(', '),
      cc: Array.from(allCc).join(', '),
      subject: selectedThread.subject.startsWith('Re:')
        ? selectedThread.subject
        : `Re: ${selectedThread.subject}`,
      replyToThreadId: selectedThread.id,
      replyToMessageId: lastMsg.id,
      bodyMarkdown: `\n\nOn ${dateStr}, ${senderStr} wrote:\n${quotedBody}`,
    });
  }, [selectedThread, handleCompose, userEmail]);

  const handleForward = useCallback(() => {
    if (!selectedThread) return;
    const lastMsg = selectedThread.messages[selectedThread.messages.length - 1];
    handleCompose({
      to: '',
      subject: selectedThread.subject.startsWith('Fwd:')
        ? selectedThread.subject
        : `Fwd: ${selectedThread.subject}`,
      bodyMarkdown: `\n\n---------- Forwarded message ----------\nFrom: ${lastMsg.from.name || lastMsg.from.email} <${lastMsg.from.email}>\nDate: ${new Date(lastMsg.date).toLocaleString()}\nSubject: ${selectedThread.subject}\nTo: ${lastMsg.to.map(t => t.email).join(', ')}\n\n${lastMsg.bodyText || ''}`,
    });
  }, [selectedThread, handleCompose]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (query) {
      setCurrentView('search');
    }
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setCurrentView('inbox');
    setSelectedThread(null);
  }, []);

  const handleViewChange = useCallback((view: ViewType) => {
    setCurrentView(view);
    setSelectedThread(null);
    setSearchQuery('');
  }, []);

  // ── Context menu handlers ───────────────────────────────

  const handleContextArchive = useCallback(async (threadId: string) => {
    // Remove all managed labels, same as keyboard Done
    for (const label of getManagedLabels()) {
      labelThread(threadId, null, label);
    }
    await archiveThread(threadId);
    if (selectedThread?.id === threadId) {
      const idx = threads.findIndex((t) => t.id === threadId);
      const next = threads[idx + 1] || threads[idx - 1] || null;
      setSelectedThread(next);
    }
  }, [archiveThread, labelThread, getManagedLabels, selectedThread, threads]);

  const handleContextLabel = useCallback(async (threadId: string, label: string) => {
    // Remove all OTHER managed labels first (e.g. moving from Pending to Todo
    // should remove PENDING before adding TODO)
    for (const managed of getManagedLabels()) {
      if (managed !== label) {
        labelThread(threadId, null, managed);
      }
    }
    // Add the target label
    await labelThread(threadId, label, null);
    // Archive (remove from inbox) since we're moving to a specific view
    await archiveThread(threadId);
    if (selectedThread?.id === threadId) {
      const idx = threads.findIndex((t) => t.id === threadId);
      const next = threads[idx + 1] || threads[idx - 1] || null;
      setSelectedThread(next);
    }
    refresh();
  }, [labelThread, archiveThread, getManagedLabels, selectedThread, threads, refresh]);

  const handleContextStar = useCallback(async (threadId: string) => {
    const thread = threads.find((t) => t.id === threadId);
    if (!thread) return;
    const isStarred = thread.labels.includes('STARRED');
    if (isStarred) {
      await labelThread(threadId, null, 'STARRED');
    } else {
      await labelThread(threadId, 'STARRED', null);
    }
    refresh();
  }, [threads, labelThread, refresh]);

  const handleCreateRule = useCallback((senderEmail: string, senderName: string) => {
    setPrefillRule({
      id: `rule_${Date.now()}`,
      name: `Filter: ${senderName}`,
      enabled: true,
      conditions: [{ field: 'sender', operator: 'contains', value: senderEmail }],
      actions: [{ type: 'archive' }],
    });
    setSettingsTab('rules');
    setSettingsOpen(true);
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
    onTodo: () => handleLabel('TODO'),
    onStar: handleStar,
    onCompose: () => handleCompose(),
    onReply: handleReply,
    onForward: handleForward,
    onNavigateUp: () => navigateList('up'),
    onNavigateDown: () => navigateList('down'),
    onSearch: () => setAdvancedSearchOpen(true),
    onEscape: () => {
      if (settingsOpen) setSettingsOpen(false);
      else if (advancedSearchOpen) setAdvancedSearchOpen(false);
      else if (composeOpen) setComposeOpen(false);
      else setSelectedThread(null);
    },
    onRefresh: refresh,
    onSettings: () => setSettingsOpen(!settingsOpen),
    enabled: !composeOpen && !advancedSearchOpen || settingsOpen,
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
      <div className="titlebar-drag h-12 flex items-center pl-20 pr-3 bg-bg-secondary border-b border-border-subtle flex-shrink-0">
        <div className="titlebar-no-drag">
          <ViewNav currentView={currentView} onViewChange={handleViewChange} views={views} counts={viewCounts} />
        </div>
        <div className="flex-1" /> {/* This space IS draggable */}
        <div className="titlebar-no-drag flex items-center gap-2">
          <SearchBar
            query={searchQuery}
            onSearch={handleSearch}
            onAdvancedSearch={() => setAdvancedSearchOpen(true)}
            onClear={handleClearSearch}
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
        {/* Kenaz rune — far right */}
        <div className="ml-3 flex items-center" title="Kenaz ᚲ">
          <svg className="w-5 h-5" viewBox="0 0 512 512" fill="none">
            <defs>
              <linearGradient id="kenaz-rune" x1="51.2" y1="460.8" x2="460.8" y2="51.2" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#C43E0C"/>
                <stop offset="1" stopColor="#F7A94B"/>
              </linearGradient>
            </defs>
            <rect x="25.6" y="25.6" width="460.8" height="460.8" rx="102.4" fill="url(#kenaz-rune)"/>
            <path d="M332.8 112.6L189.4 256L332.8 399.4" stroke="#FFF8F0" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
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
            userEmail={userEmail}
            views={views}
            onArchive={handleContextArchive}
            onLabel={handleContextLabel}
            onStar={handleContextStar}
            onCreateRule={handleCreateRule}
          />
        </div>

        {/* Email Body */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <EmailView
            thread={selectedThread}
            onReply={handleReply}
            onArchive={handleArchive}
            onLabel={handleLabel}
            onStar={handleStar}
          />
        </div>

        {/* HubSpot Sidebar */}
        <div className="w-1/4 min-w-[260px] max-w-[360px] border-l border-border-subtle overflow-hidden">
          <Sidebar
            thread={selectedThread}
            hubspotEnabled={appConfig?.hubspotEnabled}
            hubspotPortalId={appConfig?.hubspotPortalId}
          />
        </div>
      </div>

      {/* Compose Bar */}
      {composeOpen && (
        <ComposeBar
          initialData={composeData}
          onClose={() => setComposeOpen(false)}
          onSent={() => { setComposeOpen(false); refresh(); }}
          autoBccEnabled={appConfig?.autoBccEnabled}
        />
      )}

      {/* Advanced Search Modal */}
      {advancedSearchOpen && (
        <AdvancedSearch
          onSearch={(query) => { handleSearch(query); setAdvancedSearchOpen(false); }}
          onClose={() => setAdvancedSearchOpen(false)}
        />
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal
          onClose={() => { setSettingsOpen(false); setSettingsTab(undefined); setPrefillRule(undefined); }}
          onViewsChanged={(v) => setViews(v)}
          initialTab={settingsTab as any}
          prefillRule={prefillRule}
        />
      )}
    </div>
  );
}
