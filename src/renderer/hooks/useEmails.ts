import { useState, useEffect, useCallback, useRef } from 'react';
import type { EmailThread, ViewType, View } from '@shared/types';
import { VIEWS } from '@shared/types';

function buildQuery(currentView: ViewType, searchQuery: string, views: View[]): string {
  if (currentView === 'search' && searchQuery) {
    return searchQuery;
  }

  // Try dynamic views first, fall back to hardcoded VIEWS
  const dynamicView = views.find((v) => v.id === currentView);
  if (dynamicView) {
    return dynamicView.query;
  }

  // Backward compat fallback
  const view = VIEWS.find((v) => v.type === currentView);
  return view?.query || 'in:inbox';
}

export function useEmails(currentView: ViewType, searchQuery: string, enabled: boolean = true, views: View[] = []) {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [loading, setLoading] = useState(false);

  // Per-view cache for instant switching
  const cacheRef = useRef<Record<string, EmailThread[]>>({});

  // Derive query string directly (no useCallback indirection)
  const query = buildQuery(currentView, searchQuery, views);

  const fetchThreads = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const result = await window.kenaz.fetchThreads(query, 50);
      cacheRef.current[query] = result;
      setThreads(result);
    } catch (e) {
      console.error('Failed to fetch threads:', e);
    } finally {
      setLoading(false);
    }
  }, [query, enabled]);

  // Fetch whenever query or enabled changes
  useEffect(() => {
    if (!enabled) return;
    // Show cached version instantly if available
    const cached = cacheRef.current[query];
    if (cached) {
      setThreads(cached);
    }
    // Always fetch fresh data in the background
    fetchThreads();
  }, [query, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const archiveThread = useCallback(async (threadId: string) => {
    // Optimistic: remove from list immediately, then fire API call
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    try {
      await window.kenaz.archiveThread(threadId);
    } catch (e) {
      console.error('Failed to archive:', e);
      // On failure, re-fetch to restore correct state
      fetchThreads();
    }
  }, [fetchThreads]);

  const labelThread = useCallback(async (threadId: string, add: string | null, remove: string | null) => {
    // Optimistic: update labels in list immediately
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== threadId) return t;
        let labels = [...t.labels];
        if (remove) labels = labels.filter((l) => l !== remove);
        if (add && !labels.includes(add)) labels.push(add);
        return { ...t, labels };
      })
    );
    try {
      await window.kenaz.modifyLabels(threadId, add, remove);
    } catch (e) {
      console.error('Failed to modify labels:', e);
      fetchThreads();
    }
  }, [fetchThreads]);

  const markRead = useCallback(async (threadId: string) => {
    try {
      await window.kenaz.markAsRead(threadId);
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== threadId) return t;
          return {
            ...t,
            isUnread: false,
            labels: t.labels.filter((l) => l !== 'UNREAD'),
            messages: t.messages.map((m) => ({
              ...m,
              isUnread: false,
              labels: m.labels.filter((l) => l !== 'UNREAD'),
            })),
          };
        })
      );
    } catch (e) {
      console.error('Failed to mark read:', e);
    }
  }, []);

  return {
    threads,
    loading,
    refresh: fetchThreads,
    archiveThread,
    labelThread,
    markRead,
  };
}
