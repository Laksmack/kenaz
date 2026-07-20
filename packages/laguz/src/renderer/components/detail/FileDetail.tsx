import React, { useCallback, useState } from 'react';
import { useFile } from '../../hooks/useNotes';
import { useSaveStatus } from '../../hooks/useSaveStatus';
import { useEditorConfig } from '../../App';
import { formatDate } from '../../lib/utils';
import { extFromPath } from './fileTypes';
import { NoteEditor } from './NoteEditor';
import { SaveAsDialog } from './SaveAsDialog';

// ── Generic FileDetail (non-indexed text files) ──────────────

export function FileDetail({ filePath, onDirtyChange }: { filePath: string; onDirtyChange?: (dirty: boolean) => void }) {
  const { file, loading } = useFile(filePath);
  const editorConfig = useEditorConfig();
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const { status: saveAsStatus, flash: flashSaved } = useSaveStatus();

  const filename = filePath.split('/').pop() || filePath;
  const ext = extFromPath(filePath).toUpperCase() || 'TXT';

  const handleSaveAs = useCallback(async (targetPath: string) => {
    if (!file || !targetPath.trim()) return;
    try {
      await window.laguz.writeFile(targetPath.trim(), file.content);
      setSaveAsOpen(false);
      flashSaved('Saved');
    } catch (e) {
      console.error('Failed to save copy:', e);
    }
  }, [file, flashSaved]);

  if (loading || !file) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    );
  }

  const wordCount = file.content.trim() ? file.content.trim().split(/\s+/).length : 0;
  const lineCount = file.content.split('\n').length;
  const charCount = file.content.length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-text-primary font-mono">{filename}</h1>
          <div className="flex items-center gap-2">
            {saveAsStatus && <span className="text-xs text-accent-primary">{saveAsStatus}</span>}
            <button
              onClick={() => setSaveAsOpen(true)}
              className="flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-medium text-text-secondary hover:bg-bg-hover transition-colors"
              title="Save As…"
            >
              Save As…
            </button>
            <span className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider"
              style={{ background: 'rgba(92, 184, 165, 0.12)', color: '#5CB8A5' }}
            >
              {ext}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted">
          <span>{filePath}</span>
          {file.modified && <span>{formatDate(file.modified)}</span>}
          <span>{lineCount} lines · {wordCount} words · {charCount} chars</span>
        </div>
      </div>

      <NoteEditor
        content={file.content}
        notePath={filePath}
        onDone={() => {}}
        isMd={false}
        showLineNumbers={editorConfig.lineNumbers}
        onDirtyChange={onDirtyChange}
      />

      {saveAsOpen && (
        <SaveAsDialog
          defaultPath={filePath.replace(/(\.[^.]+)$/, ' (copy)$1')}
          onSave={handleSaveAs}
          onCancel={() => setSaveAsOpen(false)}
        />
      )}
    </div>
  );
}
