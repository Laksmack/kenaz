import { useState, useEffect, useCallback } from 'react';
import type { EmailThread, ViewType } from '@shared/types';
import { VIEWS } from '@shared/types';

export function useEmails(currentView: ViewType, searchQuery: string, enabled: boolean = true) {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [loading, setLoading] = useState(false);

  const getQuery = useCallback(() => {
    if (currentView === 'search' && searchQuery) {
      return searchQuery;
    }
    const view = VIEWS.find((v) => v.type === currentView);
    return view?.query || 'in:inbox';
  }, [currentView, searchQuery]);

  const fetchThreads = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const query = getQuery();
      const result = await window.kenaz.fetchThreads(query, 50);
      setThreads(result);
    } catch (e) {
      console.error('Failed to fetch threads:', e);
    } finally {
      setLoading(false);
    }
  }, [getQuery, enabled]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const archiveThread = useCallback(async (threadId: string) => {
    try {
      await window.kenaz.archiveThread(threadId);
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
    } catch (e) {
      console.error('Failed to archive:', e);
    }
  }, []);

  const labelThread = useCallback(async (threadId: string, add: string | null, remove: string | null) => {
    try {
      await window.kenaz.modifyLabels(threadId, add, remove);
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== threadId) return t;
          let labels = [...t.labels];
          if (remove) labels = labels.filter((l) => l !== remove);
          if (add && !labels.includes(add)) labels.push(add);
          return { ...t, labels };
        })
      );
    } catch (e) {
      console.error('Failed to modify labels:', e);
    }
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
    refresh: fetchThreads,
    archiveThread,
    labelThread,
    markRead,
  };
}
