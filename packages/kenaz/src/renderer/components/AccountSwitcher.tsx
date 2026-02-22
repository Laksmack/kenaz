import React, { useState, useRef, useEffect } from 'react';
import type { AccountInfo } from '@shared/types';

interface Props {
  accounts: AccountInfo[];
  activeAccount: string;
  onSwitch: (email: string) => void;
  onAdd: () => void;
  onRemove: (email: string) => void;
}

function getInitials(email: string): string {
  const local = email.split('@')[0];
  if (!local) return '?';
  return local.charAt(0).toUpperCase();
}

function getAvatarColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'bg-blue-600', 'bg-emerald-600', 'bg-violet-600',
    'bg-amber-600', 'bg-rose-600', 'bg-cyan-600',
    'bg-indigo-600', 'bg-pink-600',
  ];
  return colors[Math.abs(hash) % colors.length];
}

export function AccountSwitcher({ accounts, activeAccount, onSwitch, onAdd, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmRemove(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (accounts.length <= 1 && !open) {
    // Single account: just show an add button
    return (
      <button
        onClick={onAdd}
        className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors"
        title="Add account"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      </button>
    );
  }

  const activeInitial = getInitials(activeAccount);
  const activeColor = getAvatarColor(activeAccount);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-1.5 py-1 rounded-md transition-colors ${
          open ? 'bg-bg-hover' : 'hover:bg-bg-hover'
        }`}
        title={activeAccount}
      >
        <div className={`w-5 h-5 rounded-full ${activeColor} flex items-center justify-center text-[10px] font-bold text-white`}>
          {activeInitial}
        </div>
        <svg className={`w-3 h-3 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-bg-secondary border border-border-subtle rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
            Accounts
          </div>
          {accounts.map((acct) => (
            <div
              key={acct.email}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                acct.email === activeAccount
                  ? 'bg-accent-primary/10 text-text-primary'
                  : 'hover:bg-bg-hover text-text-secondary'
              }`}
            >
              <div
                className="flex-1 flex items-center gap-2 min-w-0"
                onClick={() => {
                  if (acct.email !== activeAccount) {
                    onSwitch(acct.email);
                    setOpen(false);
                  }
                }}
              >
                <div className={`w-6 h-6 rounded-full ${getAvatarColor(acct.email)} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>
                  {getInitials(acct.email)}
                </div>
                <span className="text-sm truncate">{acct.email}</span>
                {acct.email === activeAccount && (
                  <svg className="w-3.5 h-3.5 text-accent-primary flex-shrink-0 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              {accounts.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirmRemove === acct.email) {
                      onRemove(acct.email);
                      setConfirmRemove(null);
                      if (accounts.length <= 2) setOpen(false);
                    } else {
                      setConfirmRemove(acct.email);
                    }
                  }}
                  className={`p-0.5 rounded transition-colors flex-shrink-0 ${
                    confirmRemove === acct.email
                      ? 'text-accent-danger hover:bg-accent-danger/10'
                      : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
                  }`}
                  title={confirmRemove === acct.email ? 'Click again to confirm removal' : 'Remove account'}
                >
                  {confirmRemove === acct.email ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          ))}

          <div className="border-t border-border-subtle">
            <button
              onClick={() => {
                onAdd();
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-text-secondary hover:bg-bg-hover transition-colors"
            >
              <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
