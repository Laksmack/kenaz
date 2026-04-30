import { useState, useEffect, useCallback, useRef } from 'react';
import type { EmailThread, ViewType, View } from '@shared/types';
import { VIEWS } from '@shared/types';
import { extractLinearIssueKeys } from '../lib/linear';

function buildQuery(currentView: ViewType, searchQuery: string, views: View[]): string {
  if (currentView === 'search') {
    return searchQuery.trim();
  }
  if (currentView === 'linear') {
    return 'in:inbox';
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

export function useEmails(
  currentView: ViewType,
  searchQuery: string,
  enabled: boolean = true,
  views: View[] = [],
  sort: InboxSort = 'newest',
  userEmail: string = '',
  /** When true, background sync triggers a network list refresh; when false, reload from local cache only. */
  isOnline: boolean = true,
) {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const nextPageTokenRef = useRef<string | undefined>(undefined);
  const requestSeqRef = useRef(0);

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

  const isFollowUpCandidate = useCallback((thread: EmailThread): boolean => {
    if (!userEmail) return false;
    if (thread.labels.includes('INBOX')) return false;
    if (thread.labels.includes('TRASH') || thread.labels.includes('SPAM')) return false;
    if (thread.labels.includes('SNOOZED')) return false;

    const lastMsg = thread.messages[thread.messages.length - 1];
    if (!lastMsg) return false;

    const isFromMe = lastMsg.from.email.toLowerCase() === userEmail.toLowerCase();
    if (!isFromMe) return false;

    const msgDate = new Date(lastMsg.date);
    if (Number.isNaN(msgDate.getTime())) return false;
    const daysAgo = Math.floor((Date.now() - msgDate.getTime()) / (1000 * 60 * 60 * 24));

    return daysAgo >= 2;
  }, [userEmail]);

  const augmentInboxWithFollowUps = useCallback(async (inboxThreads: EmailThread[]) => {
    if (currentView !== 'inbox' || !userEmail) return inboxThreads;

    try {
      // Pull from local cache to keep follow-up candidates visible even if INBOX
      // label reconciliation removes them during a background refresh.
      const cacheResult = await window.kenaz.fetchThreadsFromCache('', 250);
      const extras = cacheResult.threads
        .filter(isFollowUpCandidate)
        .slice(0, 25);

      if (extras.length === 0) return inboxThreads;

      const seen = new Set(inboxThreads.map((t) => t.id));
      const merged = [...inboxThreads];
      for (const thread of extras) {
        if (!seen.has(thread.id)) {
          merged.push(thread);
          seen.add(thread.id);
        }
      }
      return merged;
    } catch (e) {
      console.error('[useEmails] Failed to augment inbox with follow-ups:', e);
      return inboxThreads;
    }
  }, [currentView, userEmail, isFollowUpCandidate]);

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

  const filterLinearView = useCallback((list: EmailThread[]) => {
    if (currentView !== 'linear') return list;
    return list.filter((thread) => {
      const text = `${thread.subject || ''}\n${thread.snippet || ''}`;
      return extractLinearIssueKeys(text).length > 0;
    });
  }, [currentView]);

  const fetchThreads = useCallback(async () => {
    if (!enabled) return;
    const requestSeq = ++requestSeqRef.current;
    setLoading(true);
    nextPageTokenRef.current = undefined;
    try {
      if (currentView === 'search') {
        if (!query) {
          if (requestSeq !== requestSeqRef.current) return;
          setHasMore(false);
          cacheRef.current[query] = [];
          setThreads([]);
          return;
        }
        const searchResults = await window.kenaz.search(query);
        if (requestSeq !== requestSeqRef.current) return;
        setHasMore(false);
        const sorted = applySort(filterRecentlyDone(filterLinearView(searchResults)));
        cacheRef.current[query] = sorted;
        setThreads(sorted);
        return;
      }

      const result = await window.kenaz.fetchThreads(query, PAGE_SIZE);
      if (requestSeq !== requestSeqRef.current) return;
      nextPageTokenRef.current = result.nextPageToken;
      setHasMore(!!result.nextPageToken);
      const withFollowUps = await augmentInboxWithFollowUps(result.threads);
      const sorted = applySort(filterRecentlyDone(filterLinearView(withFollowUps)));
      cacheRef.current[query] = sorted;
      setThreads(sorted);
    } catch (e) {
      console.error('Failed to fetch threads:', e);
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [query, enabled, currentView, applySort, filterRecentlyDone, filterLinearView, augmentInboxWithFollowUps]);

  const refreshFromCache = useCallback(async () => {
    if (!enabled) return;
    const requestSeq = ++requestSeqRef.current;
    try {
      if (currentView === 'search') {
        if (!query) {
          if (requestSeq !== requestSeqRef.current) return;
          setHasMore(false);
          cacheRef.current[query] = [];
          setThreads([]);
          return;
        }
        const searchResults = await window.kenaz.search(query);
        if (requestSeq !== requestSeqRef.current) return;
        setHasMore(false);
        const sorted = applySort(filterRecentlyDone(filterLinearView(searchResults)));
        cacheRef.current[query] = sorted;
        setThreads(sorted);
        return;
      }

      const result = await window.kenaz.fetchThreadsFromCache(query, PAGE_SIZE);
      if (requestSeq !== requestSeqRef.current) return;
      nextPageTokenRef.current = undefined;
      setHasMore(false);
      const withFollowUps = await augmentInboxWithFollowUps(result.threads);
      const sorted = applySort(filterRecentlyDone(filterLinearView(withFollowUps)));
      cacheRef.current[query] = sorted;
      setThreads(sorted);
    } catch (e) {
      console.error('Failed to refresh threads from cache:', e);
    }
  }, [query, enabled, currentView, applySort, filterRecentlyDone, filterLinearView, augmentInboxWithFollowUps]);

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
        const filteredNewThreads = filterLinearView(filterRecentlyDone(newThreads));
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
  }, [query, enabled, loadingMore, effectiveSort, applySort, filterRecentlyDone, filterLinearView]);

  // Fetch whenever query, enabled, or sort changes
  useEffect(() => {
    if (!enabled) return;
    // Show cached version instantly if available
    const cached = cacheRef.current[query];
    if (cached) {
      setThreads(filterLinearView(filterRecentlyDone(cached)));
    }
    // Always fetch fresh data in the background
    fetchThreads();
  }, [query, enabled, effectiveSort]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for push updates from sync engine
  useEffect(() => {
    const cleanupThreads = window.kenaz.onThreadsUpdated(() => {
      // Drop in-memory list cache so we never flash stale ordering after a sync invalidates snapshots.
      cacheRef.current = {};
      if (!enabled) return;
      if (currentView === 'search') {
        void fetchThreads();
        return;
      }
      if (isOnline) {
        void fetchThreads();
      } else {
        void refreshFromCache();
      }
    });

    return () => {
      cleanupThreads();
    };
  }, [enabled, currentView, fetchThreads, refreshFromCache, isOnline]);

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

  const reportSpamThread = useCallback(async (threadId: string) => {
    recentDoneRef.current.set(threadId, Date.now() + RECENT_DONE_SUPPRESS_MS);
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    try {
      await window.kenaz.reportSpam(threadId);
    } catch (e) {
      console.error('Failed to report spam:', e);
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
    reportSpamThread,
    removeThread,
    labelThread,
    markRead,
  };
}
