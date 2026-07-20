import React, { useCallback, useRef, useEffect, useState } from 'react';
import { useFile } from '../../hooks/useNotes';
import { useSaveStatus } from '../../hooks/useSaveStatus';
import { useEditorConfig } from '../../App';
import { formatDate } from '../../lib/utils';
import { NoteEditor } from './NoteEditor';
import { SaveAsDialog } from './SaveAsDialog';

// ── HTML Detail (code + preview toggle) ──────────────────────

export function HtmlDetail({ filePath, onDirtyChange }: { filePath: string; onDirtyChange?: (dirty: boolean) => void }) {
  const { file, loading } = useFile(filePath);
  const editorConfig = useEditorConfig();
  const [mode, setMode] = useState<'preview' | 'code'>('preview');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const { status: saveAsStatus, flash: flashSaved } = useSaveStatus();
  // Live content reflects edits saved from the code editor without a disk
  // re-read, so the preview stays in sync as you type.
  const [liveContent, setLiveContent] = useState<string | null>(null);

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

  const filename = filePath.split('/').pop() || filePath;

  useEffect(() => { setMode('preview'); setSaveAsOpen(false); setLiveContent(null); }, [filePath]);

  if (loading || !file) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    );
  }

  const displayContent = liveContent ?? file.content;
  const wordCount = displayContent.trim() ? displayContent.trim().split(/\s+/).length : 0;
  const lineCount = displayContent.split('\n').length;
  const charCount = displayContent.length;

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
            <div className="flex rounded-md overflow-hidden border border-border-subtle">
              <button
                onClick={() => setMode('preview')}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  mode === 'preview'
                    ? 'bg-accent-primary/15 text-accent-primary'
                    : 'text-text-secondary hover:bg-bg-hover'
                }`}
              >
                Preview
              </button>
              <button
                onClick={() => setMode('code')}
                className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-border-subtle ${
                  mode === 'code'
                    ? 'bg-accent-primary/15 text-accent-primary'
                    : 'text-text-secondary hover:bg-bg-hover'
                }`}
              >
                Code
              </button>
            </div>
            <span className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider"
              style={{ background: 'rgba(92, 184, 165, 0.12)', color: '#5CB8A5' }}
            >
              HTML
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted">
          <span>{filePath}</span>
          {file.modified && <span>{formatDate(file.modified)}</span>}
          <span>{lineCount} lines · {wordCount} words · {charCount} chars</span>
        </div>
      </div>

      {mode === 'code' ? (
        <NoteEditor
          content={file.content}
          notePath={filePath}
          onDone={() => setMode('preview')}
          isMd={false}
          showLineNumbers={editorConfig.lineNumbers}
          onDirtyChange={onDirtyChange}
          onContentChange={setLiveContent}
        />
      ) : (
        <div className="flex-1 overflow-hidden bg-white">
          <iframe
            ref={iframeRef}
            srcDoc={displayContent}
            sandbox="allow-same-origin"
            className="w-full h-full border-0"
            title={filename}
          />
        </div>
      )}

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
