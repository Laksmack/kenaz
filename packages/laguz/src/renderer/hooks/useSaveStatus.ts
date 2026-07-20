import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Shared transient "Saved" toast state.
 * `flash('Saved')` shows the message, then clears it after `duration` ms.
 * Replaces the copy-pasted `saveAsStatus` + setTimeout pattern that lived in
 * MarkdownDetail / FileDetail / HtmlDetail / ScratchView.
 */
export function useSaveStatus(duration = 2000) {
  const [status, setStatus] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const flash = useCallback((message = 'Saved') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus(message);
    timerRef.current = setTimeout(() => setStatus(null), duration);
  }, [duration]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { status, flash };
}
