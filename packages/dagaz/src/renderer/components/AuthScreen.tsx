import React, { useState } from 'react';

interface Props {
  onAuth: () => Promise<void>;
}

export function AuthScreen({ onAuth }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      await onAuth();
    } catch (e: any) {
      setError(e.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-bg-primary">
      <div className="text-center space-y-6 max-w-sm">
        {/* Dagaz rune icon */}
        <div className="flex justify-center">
          <svg className="w-24 h-24" viewBox="0 0 512 512" fill="none">
            <defs>
              <linearGradient id="dagaz-auth" x1="51.2" y1="460.8" x2="460.8" y2="51.2" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#2D5F8A"/>
                <stop offset="1" stopColor="#7AB8D4"/>
              </linearGradient>
            </defs>
            <rect x="25.6" y="25.6" width="460.8" height="460.8" rx="102.4" fill="url(#dagaz-auth)"/>
            <path d="M128 160L256 256L128 352M384 160L256 256L384 352" stroke="#FFF8F0" strokeWidth="35.84" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <line x1="128" y1="160" x2="128" y2="352" stroke="#FFF8F0" strokeWidth="35.84" strokeLinecap="round"/>
            <line x1="384" y1="160" x2="384" y2="352" stroke="#FFF8F0" strokeWidth="35.84" strokeLinecap="round"/>
          </svg>
        </div>

        <div>
          <h1 className="text-2xl font-light text-text-primary">Dagaz</h1>
          <p className="text-sm text-text-secondary mt-1">Personal Calendar</p>
        </div>

        <p className="text-xs text-text-muted leading-relaxed">
          Connect your Google Calendar to get started. Dagaz caches your events locally for speed
          and syncs changes back to Google Calendar.
        </p>

        <button
          onClick={handleAuth}
          disabled={loading}
          className="px-6 py-3 rounded-lg text-sm font-medium text-white brand-gradient hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Connecting...' : 'Connect Google Calendar'}
        </button>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}
