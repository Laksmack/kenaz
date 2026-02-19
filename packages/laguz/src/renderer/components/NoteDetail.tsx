import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { EditorView, keymap, drawSelection, highlightActiveLine, lineNumbers, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { EditorState, RangeSetBuilder, Prec, Extension } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, foldEffect, foldedRanges, codeFolding, foldKeymap, foldService, LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { marked } from 'marked';
import { useNote, useFile } from '../hooks/useNotes';
import { useEditorConfig } from '../App';
import { formatDate } from '../lib/utils';

// ── Helpers ─────────────────────────────────────────────────

function isMarkdown(filePath: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(filePath);
}

function extFromPath(filePath: string): string {
  const m = filePath.match(/\.([^./]+)$/);
  return m ? m[1].toLowerCase() : '';
}

async function languageExtForFile(filePath: string): Promise<Extension> {
  const ext = extFromPath(filePath);
  if (!ext || isMarkdown(filePath)) {
    return markdown({ base: markdownLanguage, codeLanguages: languages });
  }
  const desc = LanguageDescription.matchFilename(languages, filePath)
    || LanguageDescription.matchFilename(languages, `file.${ext}`);
  if (desc) {
    const support = await desc.load();
    return support;
  }
  return [];
}

function stripFrontmatter(content: string): string {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return content;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return lines.slice(i + 1).join('\n').trimStart();
  }
  return content;
}

// ── Rendered Markdown Viewer ────────────────────────────────

function NoteViewer({ content }: { content: string }) {
  const html = useMemo(() => {
    const body = stripFrontmatter(content);
    return marked.parse(body, { async: false }) as string;
  }, [content]);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-4">
      <div className="prose-laguz" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

// ── CodeMirror highlight style using Laguz CSS classes ──────

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

const codeHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#5CB8A5' },
  { tag: tags.operator, color: '#5CB8A5' },
  { tag: tags.variableName, color: '#cbd5d0' },
  { tag: tags.propertyName, color: '#8ac6bf' },
  { tag: tags.typeName, color: '#e8b06a' },
  { tag: tags.className, color: '#e8b06a' },
  { tag: tags.function(tags.variableName), color: '#8ac6bf' },
  { tag: tags.definition(tags.variableName), color: '#cbd5d0' },
  { tag: tags.string, color: '#a8c97a' },
  { tag: tags.number, color: '#d4a06a' },
  { tag: tags.bool, color: '#d4a06a' },
  { tag: tags.null, color: '#d4a06a' },
  { tag: tags.comment, color: '#5a6e6a', fontStyle: 'italic' },
  { tag: tags.lineComment, color: '#5a6e6a', fontStyle: 'italic' },
  { tag: tags.blockComment, color: '#5a6e6a', fontStyle: 'italic' },
  { tag: tags.meta, color: '#7a8a86' },
  { tag: tags.tagName, color: '#5CB8A5' },
  { tag: tags.attributeName, color: '#8ac6bf' },
  { tag: tags.attributeValue, color: '#a8c97a' },
  { tag: tags.regexp, color: '#e88a6a' },
  { tag: tags.escape, color: '#e88a6a' },
  { tag: tags.link, color: '#5CB8A5', textDecoration: 'underline' },
  { tag: tags.heading, color: '#cbd5d0', fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.invalid, color: '#e85a5a' },
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

function autoFoldFrontmatter(view: EditorView) {
  const range = findFrontmatterRange(view.state.doc);
  if (!range) return;
  queueMicrotask(() => {
    view.dispatch({ effects: foldEffect.of({ from: range.from, to: range.to }) });
  });
}

// ── CodeMirror Editor Component ─────────────────────────────

interface CursorInfo {
  line: number;
  col: number;
  selections: number;
}

function NoteEditor({ content, notePath, onContentChange, onDone, isMd = true, showLineNumbers = 'auto' }: {
  content: string;
  notePath: string;
  onContentChange: (content: string) => void;
  onDone: () => void;
  isMd?: boolean;
  showLineNumbers?: 'auto' | 'on' | 'off';
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSavedRef = useRef(content);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'modified'>('saved');
  const [docStats, setDocStats] = useState({ lines: 0, words: 0, chars: 0 });
  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, col: 1, selections: 1 });

  const saveFn = isMd ? window.laguz.writeNote : window.laguz.writeFile;

  const save = useCallback((newContent: string) => {
    if (newContent === lastSavedRef.current) return;
    setSaveStatus('saving');
    saveFn(notePath, newContent).then(() => {
      lastSavedRef.current = newContent;
      setSaveStatus('saved');
      onContentChange(newContent);
    }).catch((e: any) => {
      console.error('Failed to save:', e);
      setSaveStatus('modified');
    });
  }, [notePath, onContentChange, saveFn]);

  const debouncedSave = useCallback((newContent: string) => {
    setSaveStatus('modified');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(newContent), 500);
  }, [save]);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        debouncedSave(update.state.doc.toString());
        const text = update.state.doc.toString();
        setDocStats({
          lines: update.state.doc.lines,
          words: text.trim() ? text.trim().split(/\s+/).length : 0,
          chars: text.length,
        });
      }
      if (update.selectionSet || update.docChanged) {
        const sel = update.state.selection.main;
        const line = update.state.doc.lineAt(sel.head);
        setCursor({
          line: line.number,
          col: sel.head - line.from + 1,
          selections: update.state.selection.ranges.length,
        });
      }
    });

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: (view) => {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          save(view.state.doc.toString());
          return true;
        },
      },
      {
        key: 'Escape',
        run: () => { onDone(); return true; },
      },
    ]);

    const wantLineNums = showLineNumbers === 'on' || (showLineNumbers === 'auto' && !isMd);

    const baseExtensions: Extension[] = [
      history(),
      EditorState.allowMultipleSelections.of(true),
      drawSelection(),
      highlightActiveLine(),
      search({ top: true }),
      highlightSelectionMatches(),
      ...(wantLineNums ? [lineNumbers()] : []),
      Prec.high(saveKeymap),
      keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap, indentWithTab]),
      updateListener,
      EditorView.lineWrapping,
    ];

    async function mount() {
      if (destroyed || !containerRef.current) return;

      let langExt: Extension;
      let highlightExt: Extension;

      if (isMd) {
        langExt = [
          codeFolding({
            placeholderDOM() { return new FrontmatterWidget().toDOM(); },
          }),
          frontmatterFoldService,
          frontmatterDecoPlugin,
          markdown({ base: markdownLanguage, codeLanguages: languages }),
        ];
        highlightExt = syntaxHighlighting(laguzHighlight);
      } else {
        langExt = await languageExtForFile(notePath);
        highlightExt = syntaxHighlighting(codeHighlight);
      }

      if (destroyed) return;

      const state = EditorState.create({
        doc: content,
        extensions: [...baseExtensions, langExt, highlightExt],
      });

      const view = new EditorView({ state, parent: containerRef.current });
      viewRef.current = view;

      const text = content;
      setDocStats({
        lines: state.doc.lines,
        words: text.trim() ? text.trim().split(/\s+/).length : 0,
        chars: text.length,
      });

      if (isMd) autoFoldFrontmatter(view);
    }

    mount();

    return () => {
      destroyed = true;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        const currentContent = viewRef.current?.state.doc.toString();
        if (currentContent && currentContent !== lastSavedRef.current) {
          saveFn(notePath, currentContent).catch(() => {});
        }
      }
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [notePath]); // eslint-disable-line react-hooks/exhaustive-deps

  const langLabel = isMd ? 'Markdown' : (extFromPath(notePath).toUpperCase() || 'Plain Text');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div ref={containerRef} className="flex-1 overflow-y-auto scrollbar-hide px-6 py-4" />
      <div className="h-6 flex items-center px-3 gap-4 border-t border-border-subtle bg-bg-secondary text-[10px] text-text-muted flex-shrink-0 select-none">
        <span>Ln {cursor.line}, Col {cursor.col}{cursor.selections > 1 ? ` (${cursor.selections} sel)` : ''}</span>
        <span>{docStats.lines} lines</span>
        <span>{docStats.words} words</span>
        <span>{docStats.chars} chars</span>
        <div className="flex-1" />
        <span>{langLabel}</span>
        <span>UTF-8</span>
        <span className={saveStatus === 'saving' ? 'text-accent-primary' : saveStatus === 'modified' ? 'text-amber-400' : 'text-text-muted'}>
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'modified' ? '●' : ''}
        </span>
      </div>
    </div>
  );
}

// ── Markdown NoteDetail (indexed .md files) ──────────────────

function MarkdownDetail({ notePath, onMarkProcessed }: { notePath: string; onMarkProcessed?: () => void }) {
  const { note, loading, refresh } = useNote(notePath);
  const editorConfig = useEditorConfig();
  const [editing, setEditing] = useState(false);

  useEffect(() => { setEditing(false); }, [notePath]);

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

  const handleContentChange = useCallback(() => { refresh(); }, [refresh]);
  const handleDoneEditing = useCallback(() => { setEditing(false); refresh(); }, [refresh]);

  if (loading || !note) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-text-primary">{note.title}</h1>
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
        <NoteEditor content={note.content} notePath={note.path} onContentChange={handleContentChange} onDone={handleDoneEditing} isMd showLineNumbers={editorConfig.lineNumbers} />
      ) : (
        <NoteViewer content={note.content} />
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
    </div>
  );
}

// ── Generic FileDetail (non-indexed text files) ──────────────

function FileDetail({ filePath }: { filePath: string }) {
  const { file, loading, refresh } = useFile(filePath);
  const editorConfig = useEditorConfig();

  const handleContentChange = useCallback(() => { refresh(); }, [refresh]);

  const filename = filePath.split('/').pop() || filePath;
  const ext = extFromPath(filePath).toUpperCase() || 'TXT';

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
          <span className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider"
            style={{ background: 'rgba(92, 184, 165, 0.12)', color: '#5CB8A5' }}
          >
            {ext}
          </span>
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
        onContentChange={handleContentChange}
        onDone={() => {}}
        isMd={false}
        showLineNumbers={editorConfig.lineNumbers}
      />
    </div>
  );
}

// ── Smart Router ─────────────────────────────────────────────

interface NoteDetailProps {
  notePath: string | null;
  onMarkProcessed?: () => void;
}

export function NoteDetail({ notePath, onMarkProcessed }: NoteDetailProps) {
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

  if (isMarkdown(notePath)) {
    return <MarkdownDetail notePath={notePath} onMarkProcessed={onMarkProcessed} />;
  }

  return <FileDetail filePath={notePath} />;
}
