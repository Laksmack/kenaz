import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

// Show a visible crash screen if the app fails to mount — prevents silent black screen
function showCrashScreen(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : '';
  document.body.innerHTML = `
    <div style="padding:48px;font-family:-apple-system,system-ui,sans-serif;color:#e2e8f0;background:#0d1520;min-height:100vh;box-sizing:border-box">
      <h1 style="color:#f87171;font-size:20px;margin:0 0 12px">Dagaz failed to start</h1>
      <p style="color:#94a3b8;margin:0 0 16px">Press <kbd style="background:#1e293b;padding:2px 6px;border-radius:4px;font-size:13px">⌘⇧I</kbd> to open DevTools for details.</p>
      <pre style="background:#1e293b;padding:16px;border-radius:8px;overflow:auto;font-size:13px;line-height:1.5;white-space:pre-wrap;color:#fbbf24">${msg}\n\n${stack || ''}</pre>
    </div>`;
}

try {
  // Verify preload bridge is available before mounting React
  if (!window.dagaz) {
    throw new Error(
      'window.dagaz is undefined — the preload bridge failed to load.\n' +
      'This usually means preload.js is stale or failed to compile.\n' +
      'Try: rm -rf dist/main && npm run build:main'
    );
  }

  const root = createRoot(document.getElementById('root')!);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (err) {
  console.error('[Dagaz] Fatal mount error:', err);
  showCrashScreen(err);
}

// Catch unhandled errors that happen after initial mount
window.addEventListener('error', (event) => {
  console.error('[Dagaz] Unhandled error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Dagaz] Unhandled rejection:', event.reason);
});
