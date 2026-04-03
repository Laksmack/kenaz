const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/g;

export function extractLinearIssueKeys(text: string): string[] {
  if (!text) return [];
  const matches = text.match(ISSUE_KEY_RE) || [];
  return [...new Set(matches)];
}

export function firstLinearIssueKey(text: string): string | null {
  return extractLinearIssueKeys(text)[0] || null;
}
