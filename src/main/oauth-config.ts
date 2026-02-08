// ── Bundled OAuth Credentials ──────────────────────────────────────────
// These are YOUR app's Google OAuth credentials from Google Cloud Console.
// They ship with the app so end users never need to configure anything.
//
// To set up:
// 1. Go to https://console.cloud.google.com/
// 2. Create a project → Enable Gmail API + Google Calendar API
// 3. OAuth consent screen → set to "External", add your scopes
// 4. Create OAuth 2.0 Client ID (Desktop app type)
// 5. Paste the client_id and client_secret below
//
// For desktop apps, Google considers the client_secret non-sensitive
// (it's embedded in every installed copy). This is standard practice.

export const OAUTH_CLIENT_ID = 'REDACTED';
export const OAUTH_CLIENT_SECRET = 'REDACTED';
export const OAUTH_REDIRECT_URI = 'http://localhost:8234';
