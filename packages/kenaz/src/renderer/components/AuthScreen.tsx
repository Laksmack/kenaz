import React, { useState } from 'react';

interface Props {
  onAuthenticated: () => void;
}

export function AuthScreen({ onAuthenticated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.kenaz.gmailAuth();
      if (result.success) {
        onAuthenticated();
      } else {
        setError(result.error || 'Authentication failed');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-bg-primary">
      <div className="text-center max-w-md">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Kenaz <span className="text-accent-warm">ᚲ</span></h1>
        <p className="text-text-secondary mb-8">Fire &amp; Enlightenment for your Inbox</p>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-accent-danger/10 border border-accent-danger/20 text-accent-danger text-sm text-left">
            <p className="font-medium mb-1">Authentication Error</p>
            <p className="text-xs opacity-80 break-all">{error}</p>
          </div>
        )}

        <button
          onClick={handleAuth}
          disabled={loading}
          className="px-6 py-3 bg-accent-primary hover:bg-accent-deep disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
        >
          {loading ? 'Authenticating...' : 'Connect Gmail Account'}
        </button>

        <p className="mt-8 text-xs text-text-muted">
          Sign in with your Google account to get started.
        </p>
      </div>
    </div>
  );
}
