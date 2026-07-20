import React, { useCallback, useRef, useEffect, useState } from 'react';
import { NoteViewer } from '../NoteMarkdownPreview';
import { useNote } from '../../hooks/useNotes';
import { useSaveStatus } from '../../hooks/useSaveStatus';
import { useEditorConfig } from '../../App';
import { formatDate } from '../../lib/utils';
import { PdfDetail } from '../PdfDetail';
import { NoteEditor } from './NoteEditor';
import { SaveAsDialog } from './SaveAsDialog';
import { processDroppedFiles } from './processDroppedFiles';

// ── Markdown NoteDetail (indexed .md files) ──────────────────

export function MarkdownDetail({ notePath, onMarkProcessed, onFolderNavigate, onNoteNavigate, onDirtyChange }: {
  notePath: string;
  onMarkProcessed?: () => void;
  onFolderNavigate?: (folderName: string) => void;
  onNoteNavigate?: (noteName: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { note, loading, refresh } = useNote(notePath);
  const editorConfig = useEditorConfig();
  const [editing, setEditing] = useState(false);
  const [folderNames, setFolderNames] = useState<Set<string>>(new Set());
  const [linkedPdf, setLinkedPdf] = useState<string | null>(null);
  const [viewDragOver, setViewDragOver] = useState(false);
  const editorInsertRef = useRef<((text: string) => void) | null>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsPath, setSaveAsPath] = useState('');
  const { status: saveAsStatus, flash: flashSaved } = useSaveStatus();

  useEffect(() => { setEditing(false); setLinkedPdf(null); setSaveAsOpen(false); }, [notePath]);

  useEffect(() => {
    window.laguz.getVaultFolders().then(folders => {
      setFolderNames(new Set(folders.map(f => f.name)));
    }).catch((e) => console.error('[NoteDetail] Failed to load vault folders:', e));
  }, []);

  const handleMarkProcessed = useCallback(async () => {
    if (!note) return;
    const lines = note.content.split('\n');
    let inFrontmatter = false;
    let replaced = false;
    const newLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0 && line.trim() === '---') {
        inFrontmatter = true;
        newLines.push(line);
        continue;
      }
      if (inFrontmatter && line.trim() === '---') {
        if (!replaced) newLines.push('processed: true');
        inFrontmatter = false;
        newLines.push(line);
        continue;
      }
      if (inFrontmatter && /^processed:\s/.test(line)) {
        newLines.push('processed: true');
        replaced = true;
        continue;
      }
      newLines.push(line);
    }

    await window.laguz.writeNote(note.path, newLines.join('\n'));
    refresh();
    onMarkProcessed?.();
  }, [note, refresh, onMarkProcessed]);

  // Refresh once when leaving edit mode so frontmatter-derived header
  // metadata (word count, processed badge, tags) reflects the saved file.
  const handleDoneEditing = useCallback(() => { setEditing(false); refresh(); }, [refresh]);

  const handlePdfOpen = useCallback((pdfPath: string) => {
    setLinkedPdf(pdfPath);
  }, []);

  const handleSaveAs = useCallback(async (targetPath: string) => {
    if (!note || !targetPath.trim()) return;
    let path = targetPath.trim();
    if (!path.endsWith('.md')) path += '.md';
    try {
      await window.laguz.writeNote(path, note.content);
      setSaveAsOpen(false);
      flashSaved('Saved');
    } catch (e) {
      console.error('Failed to save copy:', e);
    }
  }, [note, flashSaved]);

  const handleViewDrop = useCallback(async (e: React.DragEvent) => {
    const files = e.dataTransfer?.files;
    if (!files?.length || !note) return;
    e.preventDefault();
    e.stopPropagation();
    setViewDragOver(false);

    const result = await processDroppedFiles(files);
    const parts: string[] = [];
    if (result.inlineContent) parts.push(result.inlineContent);
    if (result.links.length) parts.push(result.links.join('\n'));

    if (editing && editorInsertRef.current) {
      if (parts.length) editorInsertRef.current(parts.join('\n') + '\n');
    } else if (parts.length) {
      const newContent = note.content.trimEnd() + '\n\n' + parts.join('\n') + '\n';
      await window.laguz.writeNote(note.path, newContent);
      refresh();
    }

    if (result.pdfPaths.length > 0) {
      setLinkedPdf(result.pdfPaths[0]);
    }
  }, [note, editing, refresh]);

  if (loading || !note) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    );
  }

  const noteContent = (
    <div
      className="flex-1 flex flex-col overflow-hidden relative"
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setViewDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget as Node)) return; setViewDragOver(false); }}
      onDrop={handleViewDrop}
    >
      {viewDragOver && (
        <div className="absolute inset-0 z-50 bg-accent-primary/10 border-2 border-dashed border-accent-primary/40 rounded-lg flex items-center justify-center pointer-events-none">
          <div className="px-4 py-2 rounded-lg bg-bg-secondary/90 border border-accent-primary/30">
            <span className="text-accent-primary text-sm font-medium">Drop to attach</span>
          </div>
        </div>
      )}

      <div className="px-6 py-4 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-text-primary">{note.title}</h1>
          <div className="flex items-center gap-2">
            {saveAsStatus && <span className="text-xs text-accent-primary">{saveAsStatus}</span>}
            <button
              onClick={() => { setSaveAsPath(notePath.replace(/\.md$/, ' (copy).md')); setSaveAsOpen(true); }}
              className="flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-medium text-text-secondary hover:bg-bg-hover transition-colors"
              title="Save As… (⌘⇧S)"
            >
              Save As…
            </button>
            {linkedPdf && (
              <button
                onClick={() => setLinkedPdf(null)}
                className="flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                style={{ background: 'rgba(232, 131, 74, 0.12)', color: '#E8834A' }}
              >
                Close PDF
              </button>
            )}
            <button
              onClick={() => editing ? handleDoneEditing() : setEditing(true)}
              className="flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
              style={{
                background: editing ? 'rgba(74, 168, 154, 0.15)' : 'rgb(var(--bg-tertiary))',
                color: editing ? '#4AA89A' : 'rgb(var(--text-secondary))',
              }}
            >
              {editing ? 'Done' : 'Edit'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-text-secondary">
          {note.date && <span>{formatDate(note.date)}</span>}
          {note.company && (
            <span style={{ color: 'var(--color-reference)' }}>{note.company}</span>
          )}
          {note.type && <span className="tag-pill">{note.type}</span>}
          {note.subtype && <span className="tag-pill">{note.subtype}</span>}
          <span className="text-text-muted">{note.word_count} words</span>
          {note.type === 'meeting' && (
            note.processed === 1
              ? <span className="badge-processed">processed</span>
              : <span className="badge-unprocessed">unprocessed</span>
          )}
        </div>
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {note.tags.map(tag => (
              <span key={tag} className="tag-pill">{tag}</span>
            ))}
          </div>
        )}
        {Object.keys(note.meta).length > 0 && (
          <div className="mt-2 text-xs text-text-muted space-y-0.5">
            {Object.entries(note.meta).map(([key, value]) => (
              <div key={key}>
                <span className="font-medium">{key}:</span> {value}
              </div>
            ))}
          </div>
        )}
      </div>

      {editing ? (
        <NoteEditor
          content={note.content}
          notePath={note.path}
          onDone={handleDoneEditing}
          isMd
          showLineNumbers={editorConfig.lineNumbers}
          folderNames={folderNames}
          onRegisterInsert={(fn) => { editorInsertRef.current = fn; }}
          onDirtyChange={onDirtyChange}
        />
      ) : (
        <NoteViewer
          content={note.content}
          notePath={note.path}
          onContentChange={(newContent) => {
            window.laguz.writeNote(note.path, newContent).then(() => refresh()).catch(console.error);
          }}
          folderNames={folderNames}
          onFolderNavigate={onFolderNavigate}
          onNoteNavigate={onNoteNavigate}
          onPdfOpen={handlePdfOpen}
        />
      )}

      {note.type === 'meeting' && note.processed === 0 && (
        <div className="px-6 py-3 border-t flex-shrink-0 flex items-center gap-3"
          style={{ borderColor: '#E8834A', background: 'rgba(232, 131, 74, 0.08)' }}
        >
          <span className="text-xs" style={{ color: '#E8834A' }}>
            This meeting has not been processed
          </span>
          <button
            onClick={handleMarkProcessed}
            className="ml-auto px-3 py-1.5 rounded-md text-xs font-medium text-white"
            style={{ background: '#4AA89A' }}
          >
            Mark as processed
          </button>
        </div>
      )}

      {saveAsOpen && (
        <SaveAsDialog
          defaultPath={saveAsPath}
          onSave={handleSaveAs}
          onCancel={() => setSaveAsOpen(false)}
        />
      )}
    </div>
  );

  if (linkedPdf) {
    return (
      <div className="flex-1 flex overflow-hidden">
        <div className="flex flex-col overflow-hidden" style={{ width: '50%' }}>
          {noteContent}
        </div>
        <div className="w-1 flex-shrink-0 bg-border-subtle" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <PdfDetail filePath={linkedPdf} />
        </div>
      </div>
    );
  }

  return noteContent;
}
