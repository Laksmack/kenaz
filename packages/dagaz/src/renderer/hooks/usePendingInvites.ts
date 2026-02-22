import { useState, useEffect, useCallback, useRef } from 'react';
import type { PendingInvite } from '../../shared/types';

const DEFAULT_INTERVAL = 300000; // 5 minutes

export function usePendingInvites(intervalMs?: number) {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);
  const dismissedRef = useRef(new Set<string>());

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.dagaz.getPendingInvites();
      if (mountedRef.current) {
        const fresh = (result || []).filter(
          (i: PendingInvite) => !dismissedRef.current.has(i.threadId),
        );
        // Prune dismissed IDs that are no longer in the source (archive propagated)
        const freshIds = new Set((result || []).map((i: PendingInvite) => i.threadId));
        for (const id of dismissedRef.current) {
          if (!freshIds.has(id)) dismissedRef.current.delete(id);
        }
        setInvites(fresh);
      }
    } catch {
      // Kenaz unreachable — keep existing state
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, intervalMs ?? DEFAULT_INTERVAL);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  const dismissInvite = useCallback((threadId: string) => {
    dismissedRef.current.add(threadId);
    setInvites(prev => prev.filter(i => i.threadId !== threadId));
  }, []);

  return {
    invites,
    count: invites.length,
    isLoading,
    refresh,
    dismissInvite,
  };
}
