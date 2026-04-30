const MAX_TOKENS = 32;
const MAX_QUERY_LEN = 500;

/** Strip characters that break FTS5 phrase syntax or widen matches unintentionally. */
function sanitizeToken(t: string): string {
  return t.replace(/["'*]/g, '').trim();
}

/**
 * Build a safe FTS5 MATCH string: whitespace-separated tokens → quoted phrases.
 * Returns null when there is nothing searchable (empty after sanitization).
 */
export function buildFtsMatchQuery(raw: string): string | null {
  const trimmed = raw.trim().slice(0, MAX_QUERY_LEN);
  if (!trimmed) return null;
  const tokens = trimmed
    .split(/\s+/)
    .map(sanitizeToken)
    .filter(Boolean)
    .slice(0, MAX_TOKENS);
  if (tokens.length === 0) return null;
  return tokens.map((w) => `"${w.replace(/"/g, '')}"`).join(' ');
}
