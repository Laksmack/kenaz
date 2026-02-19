import React, { useCallback } from 'react';
import { useMeetings, useAccountDocs } from '../hooks/useNotes';
import { formatName } from '../lib/formatName';
import type { NoteSummary } from '../types';

interface AccountsViewProps {
  path: string | null;
  entity: string | null;
  activeFilePath: string | null;
  onOpenFile: (path: string, inNewTab?: boolean) => void;
}

export function AccountsView({ path, entity, activeFilePath, onOpenFile }: AccountsViewProps) {
  const { meetings, loading: meetingsLoading } = useMeetings(entity);
  const { docs, loading: docsLoading } = useAccountDocs(path);

  const handleSelect = useCallback((note: NoteSummary) => {
    onOpenFile(note.path);
  }, [onOpenFile]);

  if (!path) {
    return (
      <div className="w-2/5 min-w-[280px] max-w-[450px] border-r border-border-subtle flex items-center justify-center text-text-muted flex-shrink-0">
        <div className="text-center">
          <div className="text-3xl mb-2">🏢</div>
          <div className="text-sm">Select an account from the sidebar</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-2/5 min-w-[280px] max-w-[450px] border-r border-border-subtle flex flex-col overflow-y-auto scrollbar-hide flex-shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-subtle">
        <h2 className="text-sm font-semibold text-text-primary">
          {entity ? formatName(entity) : path}
        </h2>
      </div>

      {/* Meetings section */}
      <div className="px-4 py-3 border-b border-border-subtle">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Meetings</h3>
        <span className="text-xs text-text-muted">{meetings.length} meetings</span>
      </div>
      <div className="border-b border-border-subtle">
        {meetingsLoading ? (
          <div className="px-4 py-6 text-center text-text-muted text-sm">Loading...</div>
        ) : meetings.length === 0 ? (
          <div className="px-4 py-6 text-center text-text-muted text-sm">No meetings found</div>
        ) : (
          meetings.map((note) => (
            <div
              key={note.id}
              onClick={() => handleSelect(note)}
              className={`note-item ${activeFilePath === note.path ? 'active' : ''}`}
              style={note.processed === 0 ? { borderLeft: '3px solid #E8834A' } : undefined}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm truncate">{note.title}</span>
                  {note.processed === 0 && <span className="badge-unprocessed">unprocessed</span>}
                  {note.processed === 1 && <span className="badge-processed">processed</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {note.date && <span className="text-xs text-text-muted">{note.date}</span>}
                  {note.subtype && <span className="text-xs text-text-muted">· {note.subtype}</span>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Account docs section */}
      <div className="px-4 py-3 border-b border-border-subtle">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Account Docs</h3>
        <span className="text-xs text-text-muted">{docs.length} documents</span>
      </div>
      {docsLoading ? (
        <div className="px-4 py-6 text-center text-text-muted text-sm">Loading...</div>
      ) : docs.length === 0 ? (
        <div className="px-4 py-6 text-center text-text-muted text-sm">No account docs found</div>
      ) : (
        docs.map((note) => (
          <div
            key={note.id}
            onClick={() => handleSelect(note)}
            className={`note-item ${activeFilePath === note.path ? 'active' : ''}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm truncate">{note.title}</span>
                {note.type && <span className="tag-pill">{note.type}</span>}
              </div>
              {note.date && (
                <span className="text-xs text-text-muted mt-0.5 block">{note.date}</span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
