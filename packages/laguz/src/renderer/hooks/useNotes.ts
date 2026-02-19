import { useState, useEffect, useCallback, useRef } from 'react';
import type { NoteSummary, NoteDetail } from '../types';

export function useSearch() {
  const [results, setResults] = useState<NoteSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback((query: string, filters?: { type?: string; company?: string }) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const notes = await window.laguz.search({ q: query, ...filters });
        setResults(notes);
      } catch (e) {
        console.error('Search failed:', e);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  return { results, loading, search };
}

export function useRecent() {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.laguz.getRecent(50);
      setNotes(result);
    } catch (e) {
      console.error('Failed to fetch recent notes:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { notes, loading, refresh: fetch };
}

export function useNote(notePath: string | null) {
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!notePath) { setNote(null); return; }
    setLoading(true);
    try {
      const result = await window.laguz.getNote(notePath);
      setNote(result);
    } catch (e) {
      console.error('Failed to fetch note:', e);
    } finally {
      setLoading(false);
    }
  }, [notePath]);

  useEffect(() => { fetch(); }, [fetch]);

  return { note, loading, refresh: fetch };
}

export function useFile(filePath: string | null) {
  const [file, setFile] = useState<{ path: string; content: string; modified: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!filePath) { setFile(null); return; }
    setLoading(true);
    try {
      const result = await window.laguz.readFile(filePath);
      setFile(result);
    } catch (e) {
      console.error('Failed to read file:', e);
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => { fetch(); }, [fetch]);

  return { file, loading, refresh: fetch };
}

export function useMeetings(company: string | null) {
  const [meetings, setMeetings] = useState<NoteSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!company) { setMeetings([]); return; }
    setLoading(true);
    try {
      const result = await window.laguz.getMeetings(company);
      setMeetings(result);
    } catch (e) {
      console.error('Failed to fetch meetings:', e);
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => { fetch(); }, [fetch]);

  return { meetings, loading, refresh: fetch };
}

export function useAccountDocs(folderPath: string | null) {
  const [docs, setDocs] = useState<NoteSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!folderPath) { setDocs([]); return; }
    setLoading(true);
    try {
      const result = await window.laguz.getAccount(folderPath);
      setDocs(result);
    } catch (e) {
      console.error('Failed to fetch account docs:', e);
    } finally {
      setLoading(false);
    }
  }, [folderPath]);

  useEffect(() => { fetch(); }, [fetch]);

  return { docs, loading, refresh: fetch };
}

export function useFolderNotes(folderPath: string | null) {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!folderPath) { setNotes([]); return; }
    setLoading(true);
    try {
      const result = await window.laguz.getFolderNotes(folderPath);
      setNotes(result);
    } catch (e) {
      console.error('Failed to fetch folder notes:', e);
    } finally {
      setLoading(false);
    }
  }, [folderPath]);

  useEffect(() => { fetch(); }, [fetch]);

  return { notes, loading, refresh: fetch };
}
