import React, { useState, useRef, useCallback } from 'react';
import type { OverlayPerson } from '../../shared/types';

interface Props {
  people: OverlayPerson[];
  onAdd: (email: string, name?: string) => void;
  onRemove: (email: string) => void;
  onToggle: (email: string, visible: boolean) => void;
}

interface ContactResult {
  email: string;
  display_name: string | null;
  count: number;
}

export function PeopleOverlay({ people, onAdd, onRemove, onToggle }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContactResult[]>([]);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const searchContacts = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const hits = await window.dagaz.searchContacts(q);
        const addedEmails = new Set(people.map(p => p.email));
        setResults((hits || []).filter((r: ContactResult) => !addedEmails.has(r.email)));
        setSelectedIdx(-1);
      } catch { setResults([]); }
    }, 150);
  }, [people]);

  const handleInputChange = (val: string) => {
    setQuery(val);
    setError('');
    searchContacts(val);
  };

  const handleSelect = async (contact: ContactResult) => {
    setChecking(true);
    setError('');
    try {
      const result = await window.dagaz.checkOverlayAccess(contact.email);
      if (!result.accessible) {
        setError(`No access to ${contact.email}`);
        setChecking(false);
        return;
      }
      onAdd(contact.email, contact.display_name || undefined);
      setQuery('');
      setResults([]);
    } catch {
      setError('Failed to check access');
    } finally {
      setChecking(false);
    }
  };

  const handleDirectAdd = async () => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) return;
    if (people.some(p => p.email === trimmed)) {
      setError('Already added');
      return;
    }
    await handleSelect({ email: trimmed, display_name: null, count: 0 });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIdx >= 0 && results[selectedIdx]) handleSelect(results[selectedIdx]);
      else handleDirectAdd();
    } else if (e.key === 'Escape') {
      setQuery(''); setResults([]); setError('');
    }
  };

  return (
    <div className="mb-4">
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted font-medium px-2 mb-2">Meet with…</h3>

      {/* Always-visible search input */}
      <div className="px-2 mb-2 relative">
        <input
          type="text"
          value={query}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search people…"
          className="w-full bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary placeholder:text-text-muted"
          disabled={checking}
        />
        {error && <p className="text-[10px] text-red-400 mt-1 px-0.5">{error}</p>}
        {checking && <p className="text-[10px] text-text-muted mt-1 px-0.5">Checking access…</p>}

        {results.length > 0 && !checking && (
          <div className="absolute left-2 right-2 top-full mt-1 bg-bg-secondary border border-border-subtle rounded-lg shadow-xl z-50 overflow-hidden">
            {results.map((r, i) => (
              <button
                key={r.email}
                onClick={() => handleSelect(r)}
                className={`w-full text-left px-2.5 py-2 hover:bg-bg-hover transition-colors ${
                  i === selectedIdx ? 'bg-bg-hover' : ''
                }`}
              >
                <div className="text-xs text-text-primary truncate">
                  {r.display_name || r.email.split('@')[0]}
                </div>
                <div className="text-[10px] text-text-muted truncate">{r.email}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* People list */}
      {people.map(person => (
        <div key={person.email} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-hover group">
          <button onClick={() => onToggle(person.email, !person.visible)} className="flex-shrink-0">
            <span
              className={`w-3 h-3 rounded-full block border transition-colors ${
                person.visible ? 'border-transparent' : 'border-border-subtle'
              }`}
              style={{ backgroundColor: person.visible ? person.color : 'transparent' }}
            >
              {person.visible && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
          </button>
          <span className={`text-xs truncate flex-1 ${person.visible ? 'text-text-primary' : 'text-text-muted'}`}>
            {person.name || person.email.split('@')[0]}
          </span>
          <button
            onClick={() => onRemove(person.email)}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-bg-tertiary text-text-muted hover:text-red-400 transition-all"
            title="Remove"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
