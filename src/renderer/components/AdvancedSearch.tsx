import React, { useState, useRef, useEffect } from 'react';

interface Props {
  onSearch: (query: string) => void;
  onClose: () => void;
}

export function AdvancedSearch({ onSearch, onClose }: Props) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [hasWords, setHasWords] = useState('');
  const [doesntHave, setDoesntHave] = useState('');
  const [dateWithin, setDateWithin] = useState('');
  const [dateRef, setDateRef] = useState('');
  const [hasAttachment, setHasAttachment] = useState(false);
  const [searchIn, setSearchIn] = useState('anywhere');
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const buildQuery = (): string => {
    const parts: string[] = [];
    if (from.trim()) parts.push(`from:(${from.trim()})`);
    if (to.trim()) parts.push(`to:(${to.trim()})`);
    if (subject.trim()) parts.push(`subject:(${subject.trim()})`);
    if (hasWords.trim()) parts.push(hasWords.trim());
    if (doesntHave.trim()) parts.push(`-{${doesntHave.trim()}}`);
    if (hasAttachment) parts.push('has:attachment');
    if (dateWithin && dateRef) {
      parts.push(`newer_than:${dateWithin}`);
    }
    if (searchIn === 'inbox') parts.push('in:inbox');
    else if (searchIn === 'sent') parts.push('in:sent');
    else if (searchIn === 'starred') parts.push('is:starred');
    else if (searchIn === 'trash') parts.push('in:trash');
    else if (searchIn === 'spam') parts.push('in:spam');
    return parts.join(' ');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = buildQuery();
    if (query) {
      onSearch(query);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-bg-secondary border border-border-subtle rounded-xl shadow-2xl w-[520px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <h3 className="text-sm font-semibold text-text-primary">Advanced Search</h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <FormRow label="From">
            <input
              ref={firstInputRef}
              type="text"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="e.g. john@example.com"
              className="search-input"
            />
          </FormRow>

          <FormRow label="To">
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="e.g. me, team@..."
              className="search-input"
            />
          </FormRow>

          <FormRow label="Subject">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Words in the subject line"
              className="search-input"
            />
          </FormRow>

          <FormRow label="Has words">
            <input
              type="text"
              value={hasWords}
              onChange={(e) => setHasWords(e.target.value)}
              placeholder="e.g. invoice project proposal"
              className="search-input"
            />
          </FormRow>

          <FormRow label="Doesn't have">
            <input
              type="text"
              value={doesntHave}
              onChange={(e) => setDoesntHave(e.target.value)}
              placeholder="Exclude these words"
              className="search-input"
            />
          </FormRow>

          <FormRow label="Date within">
            <div className="flex items-center gap-2">
              <select
                value={dateWithin}
                onChange={(e) => setDateWithin(e.target.value)}
                className="search-input w-auto"
              >
                <option value="">Any time</option>
                <option value="1d">1 day</option>
                <option value="3d">3 days</option>
                <option value="7d">1 week</option>
                <option value="14d">2 weeks</option>
                <option value="30d">1 month</option>
                <option value="90d">3 months</option>
                <option value="180d">6 months</option>
                <option value="365d">1 year</option>
              </select>
              {dateWithin && (
                <input
                  type="date"
                  value={dateRef}
                  onChange={(e) => setDateRef(e.target.value)}
                  className="search-input w-auto"
                />
              )}
            </div>
          </FormRow>

          <FormRow label="Search in">
            <select
              value={searchIn}
              onChange={(e) => setSearchIn(e.target.value)}
              className="search-input w-auto"
            >
              <option value="anywhere">All Mail</option>
              <option value="inbox">Inbox</option>
              <option value="sent">Sent</option>
              <option value="starred">Starred</option>
              <option value="trash">Trash</option>
              <option value="spam">Spam</option>
            </select>
          </FormRow>

          <FormRow label="">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasAttachment}
                onChange={(e) => setHasAttachment(e.target.checked)}
                className="rounded border-border-subtle bg-bg-primary text-accent-primary focus:ring-accent-primary/30"
              />
              <span className="text-xs text-text-secondary">Has attachment</span>
            </label>
          </FormRow>

          {/* Preview */}
          {buildQuery() && (
            <div className="mt-2 px-3 py-2 rounded bg-bg-primary border border-border-subtle">
              <div className="text-[10px] text-text-muted mb-0.5">Gmail query:</div>
              <code className="text-xs text-accent-primary break-all">{buildQuery()}</code>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!buildQuery()}
              className="px-5 py-2 rounded-lg text-xs font-medium bg-accent-primary hover:bg-accent-deep disabled:opacity-40 text-white transition-colors"
            >
              Search
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-text-muted w-20 text-right flex-shrink-0">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}
