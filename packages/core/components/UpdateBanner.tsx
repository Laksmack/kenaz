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
    <div className="flex items-center gap-2 text-xs text-text-secondary mr-2">
      {state.status === 'available' && (
        <span className="text-text-muted">Downloading v{state.version}...</span>
      )}
      {state.status === 'downloading' && (
        <span className="text-text-muted">Downloading... {state.percent}%</span>
      )}
      {state.status === 'ready' && (
        <>
          <span className="text-text-muted">v{state.version} ready</span>
          <button
            onClick={() => api.installUpdate()}
            className="px-2 py-0.5 rounded bg-text-primary text-bg-primary font-medium hover:opacity-90 transition-opacity"
          >
            Restart to Update
          </button>
        </>
      )}
      <button
        onClick={() => setDismissed(true)}
        className="text-text-tertiary hover:text-text-secondary"
      >
        ✕
      </button>
    </div>
  );
}
