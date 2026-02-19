import { useState, useEffect, useCallback, useRef } from 'react';
import type { PendingInvite } from '../../shared/types';

const DEFAULT_INTERVAL = 300000; // 5 minutes

export function usePendingInvites(intervalMs?: number) {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.dagaz.getPendingInvites();
      if (mountedRef.current) setInvites(result || []);
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
    setInvites(prev => prev.filter(i => i.threadId !== threadId));
    // Badge refresh: trigger a re-fetch after a short delay so the count
    // catches up on next poll cycle
  }, []);

  return {
    invites,
    count: invites.length,
    isLoading,
    refresh,
    dismissInvite,
  };
}
