import { useState, useEffect } from 'react';

/**
 * Tracks online/offline state from the main process ConnectivityMonitor.
 * Consumers can use `isOnline` to skip network calls or pause polling.
 */
export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Also listen to browser-level events as a fallback
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Main process connectivity (more reliable — uses net.isOnline + debounce)
    const unsub = window.dagaz.onConnectivityChanged((online: boolean) => {
      setIsOnline(online);
    });

    // Initial state from browser
    setIsOnline(navigator.onLine);

    return () => {
      unsub();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
}
