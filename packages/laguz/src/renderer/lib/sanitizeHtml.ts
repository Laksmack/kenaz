import type { Config } from 'dompurify';
import dompurifyDefault from 'dompurify';

type PurifyApi = {
  sanitize(dirty: string, cfg?: Config): string;
  isSupported?: boolean;
};

/**
 * DOMPurify 3 may expose either a configured instance or the factory stub (no `sanitize`)
 * depending on how/when the module initializes relative to `window`. Normalize by always
 * binding an instance to `window` when needed.
 */
export function sanitizeLaguzHtml(html: string, cfg?: Config): string {
  const mod = dompurifyDefault as unknown;

  let api: PurifyApi | null = null;

  if (mod && typeof mod === 'object' && typeof (mod as PurifyApi).sanitize === 'function') {
    api = mod as PurifyApi;
  } else if (typeof mod === 'function') {
    try {
      const win = typeof window !== 'undefined' ? window : undefined;
      const created = win
        ? (mod as (w: Window) => PurifyApi)(win)
        : (mod as () => PurifyApi)();
      if (created && typeof created.sanitize === 'function') {
        api = created;
      }
    } catch {
      return html;
    }
  }

  if (!api || typeof api.sanitize !== 'function') return html;
  if (api.isSupported === false) return html;

  try {
    const out = api.sanitize(html, cfg);
    return typeof out === 'string' ? out : html;
  } catch {
    return html;
  }
}
