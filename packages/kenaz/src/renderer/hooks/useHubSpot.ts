import { useState, useEffect } from 'react';
import type { HubSpotContext } from '@shared/types';

export function useHubSpot(email: string | null) {
  const [context, setContext] = useState<HubSpotContext>({
    contact: null,
    deals: [],
    activities: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!email) {
      setContext({ contact: null, deals: [], activities: [], loading: false, error: null });
      return;
    }

    let cancelled = false;

    const lookup = async () => {
      setContext((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const result = await window.kenaz.hubspotLookup(email);
        if (!cancelled) {
          setContext({ ...result, loading: false });
        }
      } catch (e: any) {
        if (!cancelled) {
          setContext({ contact: null, deals: [], activities: [], loading: false, error: e.message });
        }
      }
    };

    lookup();
    return () => { cancelled = true; };
  }, [email]);

  return context;
}
