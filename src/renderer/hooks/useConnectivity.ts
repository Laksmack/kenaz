import { useState, useEffect } from 'react';

export function useConnectivity(): { isOnline: boolean; pendingActions: number; outboxCount: number } {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingActions, setPendingActions] = useState(0);
  const [outboxCount, setOutboxCount] = useState(0);

  useEffect(() => {
    // Listen for connectivity changes from the main process
    const cleanup = window.kenaz.onConnectivityChange((online: boolean) => {
      setIsOnline(online);
    });

    // Check initial status
    window.kenaz.getConnectivityStatus().then((status) => {
      setIsOnline(status.online);
      setPendingActions(status.pendingActions);
      setOutboxCount(status.outboxCount);
    }).catch(() => {});

    // Poll for pending counts periodically
    const interval = setInterval(async () => {
      try {
        const status = await window.kenaz.getConnectivityStatus();
        setIsOnline(status.online);
        setPendingActions(status.pendingActions);
        setOutboxCount(status.outboxCount);
      } catch {}
    }, 10000);

    return () => {
      cleanup();
      clearInterval(interval);
    };
  }, []);

  return { isOnline, pendingActions, outboxCount };
}
