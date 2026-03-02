import React, { useState, useRef, useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onGoToDate: (date: Date) => void;
}

export function GoToDateDialog({ open, onClose, onGoToDate }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // Default to today's date in the input
      const today = new Date();
      const iso = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
      setValue(iso);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [open]);

  const handleSubmit = () => {
    const date = new Date(value + 'T00:00:00');
    if (!isNaN(date.getTime())) {
      onGoToDate(date);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-[280px] bg-bg-secondary border border-border-subtle rounded-xl shadow-2xl overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 pt-3 pb-1">
          <h3 className="text-xs font-medium text-text-primary">Go to date</h3>
        </div>
        <div className="px-4 py-3">
          <input
            ref={inputRef}
            type="date"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary/40 transition-colors"
          />
        </div>
        <div className="px-4 pb-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-3 py-1.5 text-xs font-medium bg-accent-primary/20 text-accent-primary rounded-md hover:bg-accent-primary/30 transition-colors"
          >
            Go
          </button>
        </div>
      </div>
    </div>
  );
}
