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

const PAGE_SIZE = 50;
const RECENT_DONE_SUPPRESS_MS = 5 * 60 * 1000;

export type InboxSort = 'newest' | 'oldest';

// Views that always show newest-first regardless of the inbox sort setting.
// These load 50 threads at a time from Gmail (which returns newest-first),
// so reversing them would produce a confusing mixed order.
const ALWAYS_NEWEST_FIRST: Set<ViewType> = new Set(['sent', 'all', 'search']);

export function useEmails(currentView: ViewType, searchQuery: string, enabled: boolean = true, views: View[] = [], sort: InboxSort = 'newest', userEmail: string = '') {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const nextPageTokenRef = useRef<string | undefined>(undefined);

  // Per-view cache for instant switching
  const cacheRef = useRef<Record<string, EmailThread[]>>({});
  const recentDoneRef = useRef<Map<string, number>>(new Map());

  // Derive query string directly (no useCallback indirection)
  const query = buildQuery(currentView, searchQuery, views);

  // Sent, All Mail, and Search always use newest-first
  const effectiveSort = ALWAYS_NEWEST_FIRST.has(currentView) ? 'newest' : sort;

  const getThreadTimestamp = useCallback((thread: EmailThread): number => {
    if (currentView === 'sent' && userEmail) {
      const lowerEmail = userEmail.toLowerCase();
      const sent = [...thread.messages]
        .reverse()
        .find((m) => m.from.email.toLowerCase() === lowerEmail);
      const sentTs = sent ? new Date(sent.date).getTime() : NaN;
      if (!Number.isNaN(sentTs)) return sentTs;
    }
    const lastTs = new Date(thread.lastDate).getTime();
    return Number.isNaN(lastTs) ? 0 : lastTs;
  }, [currentView, userEmail]);

  const applySort = useCallback((list: EmailThread[]) => {
    return [...list].sort((a, b) => {
      const aTs = getThreadTimestamp(a);
      const bTs = getThreadTimestamp(b);
      if (aTs !== bTs) {
        return effectiveSort === 'oldest' ? aTs - bTs : bTs - aTs;
      }
      // Stable deterministic tie-break so order doesn't flicker across refreshes.
      return a.id.localeCompare(b.id);
    });
  }, [effectiveSort, getThreadTimestamp]);

  const filterRecentlyDone = useCallback((list: EmailThread[]) => {
    // Only suppress in inbox-style views where "done" removes the thread.
    if (currentView !== 'inbox' && currentView !== 'all' && currentView !== 'search') {
      return list;
    }
    const now = Date.now();
    for (const [id, until] of recentDoneRef.current.entries()) {
      if (until <= now) recentDoneRef.current.delete(id);
    }
    if (recentDoneRef.current.size === 0) return list;
    return list.filter((t) => {
      const until = recentDoneRef.current.get(t.id);
      return !until || until <= now;
    });
  }, [currentView]);

  const fetchThreads = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    nextPageTokenRef.current = undefined;
    try {
      const result = await window.kenaz.fetchThreads(query, PAGE_SIZE);
      nextPageTokenRef.current = result.nextPageToken;
      setHasMore(!!result.nextPageToken);
      const sorted = applySort(filterRecentlyDone(result.threads));
      cacheRef.current[query] = sorted;
      setThreads(sorted);
    } catch (e) {
      console.error('Failed to fetch threads:', e);
    } finally {
      setLoading(false);
    }
  }, [query, enabled, applySort, filterRecentlyDone]);

  const refreshFromCache = useCallback(async () => {
    if (!enabled) return;
    try {
      const result = await window.kenaz.fetchThreadsFromCache(query, PAGE_SIZE);
      nextPageTokenRef.current = undefined;
      setHasMore(false);
      const sorted = applySort(filterRecentlyDone(result.threads));
      cacheRef.current[query] = sorted;
      setThreads(sorted);
    } catch (e) {
      console.error('Failed to refresh threads from cache:', e);
    }
  }, [query, enabled, applySort, filterRecentlyDone]);

  const loadMore = useCallback(async () => {
    if (!enabled || !nextPageTokenRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await window.kenaz.fetchThreads(query, PAGE_SIZE, nextPageTokenRef.current);
      nextPageTokenRef.current = result.nextPageToken;
      setHasMore(!!result.nextPageToken);
      setThreads((prev) => {
        const existingIds = new Set(prev.map((t) => t.id));
        const newThreads = result.threads.filter((t: EmailThread) => !existingIds.has(t.id));
        const filteredNewThreads = filterRecentlyDone(newThreads);
        // Gmail pages go further back in time; for oldest-first those go to the top
        const merged = effectiveSort === 'oldest'
          ? [...filteredNewThreads.reverse(), ...prev]
          : [...prev, ...filteredNewThreads];
        const sorted = applySort(merged);
        cacheRef.current[query] = sorted;
        return sorted;
      });
    } catch (e) {
      console.error('Failed to load more threads:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [query, enabled, loadingMore, effectiveSort, applySort, filterRecentlyDone]);

  // Fetch whenever query, enabled, or sort changes
  useEffect(() => {
    if (!enabled) return;
    // Show cached version instantly if available
    const cached = cacheRef.current[query];
    if (cached) {
      setThreads(filterRecentlyDone(cached));
    }
    // Always fetch fresh data in the background
    fetchThreads();
  }, [query, enabled, effectiveSort]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for push updates from sync engine
  useEffect(() => {
    const cleanupThreads = window.kenaz.onThreadsUpdated(() => {
      // Sync engine updated the cache — refresh current view
      if (enabled) {
        if (currentView === 'search') {
          fetchThreads();
        } else {
          refreshFromCache();
        }
      }
    });

    return () => {
      cleanupThreads();
    };
  }, [enabled, currentView, fetchThreads, refreshFromCache]);

  const archiveThread = useCallback(async (threadId: string) => {
    recentDoneRef.current.set(threadId, Date.now() + RECENT_DONE_SUPPRESS_MS);
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

  const removeThread = useCallback((threadId: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
  }, []);

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
    loadingMore,
    hasMore,
    refresh: fetchThreads,
    loadMore,
    archiveThread,
    removeThread,
    labelThread,
    markRead,
  };
}
