import React, { useEffect, useState, useRef, useCallback } from 'react';

export interface UndoAction {
  id: string;
  message: string;
  onUndo: () => void;
  duration?: number; // ms, default 5000
}

interface Props {
  actions: UndoAction[];
  onExpire: (id: string) => void;
}

function UndoToastItem({ action, onExpire }: { action: UndoAction; onExpire: () => void }) {
  const duration = action.duration || 5000;
  const [remaining, setRemaining] = useState(duration);
  const startRef = useRef(Date.now());
  const undoneRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const left = Math.max(0, duration - elapsed);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(timer);
        onExpire();
      }
    }, 50);
    return () => clearInterval(timer);
  }, [duration, onExpire]);

  const handleUndo = useCallback(() => {
    if (undoneRef.current) return;
    undoneRef.current = true;
    action.onUndo();
    onExpire();
  }, [action, onExpire]);

  const pct = (remaining / duration) * 100;

  return (
    <div className="flex items-center gap-3 bg-bg-secondary border border-border-subtle rounded-lg px-4 py-2.5 shadow-lg min-w-[280px] animate-slide-up">
      <span className="text-xs text-text-primary flex-1">{action.message}</span>
      <button
        onClick={handleUndo}
        className="px-2.5 py-1 bg-accent-primary hover:bg-accent-primary/80 text-white text-xs rounded font-semibold transition-colors flex-shrink-0"
      >
        Undo
      </button>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-border-subtle rounded-b-lg overflow-hidden">
        <div
          className="h-full bg-accent-primary transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function UndoToast({ actions, onExpire }: Props) {
  if (actions.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2">
      {actions.map((action) => (
        <div key={action.id} className="relative">
          <UndoToastItem action={action} onExpire={() => onExpire(action.id)} />
        </div>
      ))}
    </div>
  );
}
