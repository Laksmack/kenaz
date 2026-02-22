import React, { useState, useEffect } from 'react';

interface UpdateState {
  status: string;
  version?: string;
  percent?: number;
  message?: string;
}

interface UpdateAPI {
  onUpdateState: (cb: (state: UpdateState) => void) => () => void;
  installUpdate: () => Promise<void>;
}

export function UpdateBanner({ api }: { api: UpdateAPI }) {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    return api.onUpdateState(setState);
  }, [api]);

  if (dismissed || state.status === 'idle' || state.status === 'checking') {
    return null;
  }

  if (state.status === 'error') return null;

  return (
    <div className="flex-shrink-0 flex items-center justify-between px-4 py-1.5 bg-bg-secondary border-b border-border-subtle text-xs text-text-secondary">
      <div className="flex items-center gap-2">
        {state.status === 'available' && (
          <span>Update v{state.version} available — downloading...</span>
        )}
        {state.status === 'downloading' && (
          <span>Downloading update... {state.percent}%</span>
        )}
        {state.status === 'ready' && (
          <>
            <span>v{state.version} is ready</span>
            <button
              onClick={() => api.installUpdate()}
              className="px-2 py-0.5 rounded bg-text-primary text-bg-primary font-medium hover:opacity-90 transition-opacity"
            >
              Restart to Update
            </button>
          </>
        )}
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-text-tertiary hover:text-text-secondary ml-2"
      >
        ✕
      </button>
    </div>
  );
}
