import React, { useState } from 'react';

// ── Save As Dialog ───────────────────────────────────────────
// Shared modal for "enter a path, save a copy". Used by the note,
// file and html detail views.

export function SaveAsDialog({ defaultPath, onSave, onCancel }: {
  defaultPath: string;
  onSave: (path: string) => void;
  onCancel: () => void;
}) {
  const [path, setPath] = useState(defaultPath);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bg-secondary border border-border-subtle rounded-xl p-5 w-96 shadow-2xl">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Save As</h3>
        <p className="text-[11px] text-text-muted mb-2">Vault-relative path or absolute path (/Users/...)</p>
        <input
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="path/to/file  or  /Users/me/file.txt"
          className="w-full bg-bg-primary border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-primary/40 mb-3"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave(path);
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-md text-xs text-text-muted hover:text-text-primary">Cancel</button>
          <button onClick={() => onSave(path)} className="px-3 py-1.5 rounded-md text-xs font-medium text-white brand-gradient">Save</button>
        </div>
      </div>
    </div>
  );
}
