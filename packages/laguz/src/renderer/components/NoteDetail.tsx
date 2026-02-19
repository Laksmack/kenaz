import React, { useCallback, useRef, useEffect, useState } from 'react';
import { EditorView, keymap, drawSelection, highlightActiveLine, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { EditorState, RangeSetBuilder, Prec } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, foldEffect, foldedRanges, codeFolding, foldKeymap, foldService } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { tags } from '@lezer/highlight';
import { useNote } from '../hooks/useNotes';
import { formatDate } from '../lib/utils';

// ── Markdown highlight style using Laguz CSS classes ────────

const laguzHighlight = HighlightStyle.define([
  { tag: tags.heading1, class: 'cm-header-1' },
  { tag: tags.heading2, class: 'cm-header-2' },
  { tag: tags.heading3, class: 'cm-header-3' },
  { tag: tags.heading4, class: 'cm-header-4' },
  { tag: tags.heading5, class: 'cm-header-5' },
  { tag: tags.heading6, class: 'cm-header-6' },
  { tag: tags.strong, class: 'cm-strong' },
  { tag: tags.emphasis, class: 'cm-emphasis' },
  { tag: tags.strikethrough, class: 'cm-strikethrough' },
  { tag: tags.link, class: 'cm-link' },
  { tag: tags.url, class: 'cm-url' },
  { tag: tags.meta, class: 'cm-meta' },
  { tag: tags.quote, class: 'cm-quote' },
  { tag: tags.monospace, class: 'cm-monospace' },
  { tag: tags.processingInstruction, class: 'cm-hr' },
  { tag: tags.list, class: 'cm-list' },
]);

// ── Frontmatter fold widget ────────────────────────────────

class FrontmatterWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-frontmatter-folded';
    span.textContent = '--- frontmatter ---';
    span.title = 'Click to expand frontmatter';
    return span;
  }
  ignoreEvent() { return false; }
}

function findFrontmatterRange(doc: { toString(): string; line(n: number): { from: number; to: number; text: string }; lines: number }) {
  const firstLine = doc.line(1);
  if (firstLine.text.trim() !== '---') return null;

  for (let i = 2; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (line.text.trim() === '---') {
      return { from: firstLine.from, to: line.to };
    }
  }
  return null;
}

const frontmatterFoldService = foldService.of((state, lineStart) => {
  if (lineStart !== 0) return null;
  const range = findFrontmatterRange(state.doc);
  if (!range) return null;
  return { from: range.from, to: range.to };
});

// Decoration to dim frontmatter lines when expanded
const frontmatterDecoPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) {
    this.decorations = this.build(view);
  }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.build(update.view);
    }
  }
  build(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const range = findFrontmatterRange(view.state.doc);
    if (!range) return builder.finish();

    // Check if frontmatter is folded — if so, skip decorations (fold widget handles it)
    const folded = foldedRanges(view.state);
    let isFolded = false;
    folded.between(range.from, range.to, () => { isFolded = true; });
    if (isFolded) return builder.finish();

    const lineDecoration = Decoration.line({ class: 'cm-frontmatter-line' });
    for (let pos = range.from; pos <= range.to;) {
      const line = view.state.doc.lineAt(pos);
      builder.add(line.from, line.from, lineDecoration);
      pos = line.to + 1;
    }
    return builder.finish();
  }
}, { decorations: v => v.decorations });

// ── Auto-fold frontmatter on editor initialization ──────────

function autoFoldFrontmatter(view: EditorView) {
  const range = findFrontmatterRange(view.state.doc);
  if (!range) return;

  // Dispatch the fold after a microtask to let the editor settle
  queueMicrotask(() => {
    view.dispatch({
      effects: foldEffect.of({ from: range.from, to: range.to }),
    });
  });
}

// ── Editor Component ────────────────────────────────────────

function NoteEditor({ content, notePath, onContentChange }: {
  content: string;
  notePath: string;
  onContentChange: (content: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSavedRef = useRef(content);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'modified'>('saved');

  const save = useCallback((newContent: string) => {
    if (newContent === lastSavedRef.current) return;
    setSaveStatus('saving');
    window.laguz.writeNote(notePath, newContent).then(() => {
      lastSavedRef.current = newContent;
      setSaveStatus('saved');
      onContentChange(newContent);
    }).catch((e) => {
      console.error('Failed to save note:', e);
      setSaveStatus('modified');
    });
  }, [notePath, onContentChange]);

  const debouncedSave = useCallback((newContent: string) => {
    setSaveStatus('modified');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(newContent), 500);
  }, [save]);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        debouncedSave(update.state.doc.toString());
      }
    });

    // Cmd+S / Ctrl+S to save immediately
    const saveKeymap = keymap.of([{
      key: 'Mod-s',
      run: (view) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        save(view.state.doc.toString());
        return true;
      },
    }]);

    const state = EditorState.create({
      doc: content,
      extensions: [
        history(),
        drawSelection(),
        highlightActiveLine(),
        codeFolding({
          placeholderDOM(_view, _onclick) {
            const widget = new FrontmatterWidget();
            return widget.toDOM();
          },
        }),
        frontmatterFoldService,
        frontmatterDecoPlugin,
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(laguzHighlight),
        Prec.high(saveKeymap),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          indentWithTab,
        ]),
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    autoFoldFrontmatter(view);

    return () => {
      // Flush any pending save on unmount
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        const currentContent = view.state.doc.toString();
        if (currentContent !== lastSavedRef.current) {
          window.laguz.writeNote(notePath, currentContent).catch(() => {});
        }
      }
      view.destroy();
      viewRef.current = null;
    };
  }, [notePath]); // Only re-create editor when note path changes

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div ref={containerRef} className="flex-1 overflow-y-auto scrollbar-hide px-6 py-4" />
      {/* Save status indicator */}
      <div className="absolute bottom-2 right-4 text-[10px] text-text-muted pointer-events-none select-none">
        {saveStatus === 'saving' && 'Saving...'}
        {saveStatus === 'modified' && '●'}
      </div>
    </div>
  );
}

// ── NoteDetail (outer component with header) ────────────────

interface NoteDetailProps {
  notePath: string | null;
  onMarkProcessed?: () => void;
}

export function NoteDetail({ notePath, onMarkProcessed }: NoteDetailProps) {
  const { note, loading, refresh } = useNote(notePath);

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
        if (!replaced) {
          newLines.push('processed: true');
        }
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

  const handleContentChange = useCallback(() => {
    // Refresh the note metadata after a save (title, tags, etc. might have changed)
    refresh();
  }, [refresh]);

  if (!notePath) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-40">ᛚ</div>
          <div className="text-sm">Select a note to view</div>
        </div>
      </div>
    );
  }

  if (loading || !note) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border-subtle flex-shrink-0">
        <h1 className="text-lg font-semibold text-text-primary">{note.title}</h1>
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

        {/* Tags */}
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {note.tags.map(tag => (
              <span key={tag} className="tag-pill">{tag}</span>
            ))}
          </div>
        )}

        {/* Extra metadata */}
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

      {/* Editor body */}
      <NoteEditor
        content={note.content}
        notePath={note.path}
        onContentChange={handleContentChange}
      />

      {/* Mark processed footer */}
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
    </div>
  );
}
