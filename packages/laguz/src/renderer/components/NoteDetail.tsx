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
import { PdfDetail } from './PdfDetail';
import type { VaultFolder } from '../types';

// ── Helpers ─────────────────────────────────────────────────

function isMarkdown(filePath: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(filePath);
}

function isPdf(filePath: string): boolean {
  return /\.pdf$/i.test(filePath);
}

function isDocx(filePath: string): boolean {
  return /\.docx?$/i.test(filePath);
}

function isHtml(filePath: string): boolean {
  return /\.html?$/i.test(filePath);
}

const IMAGE_VIEWER_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif']);
function isImage(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return IMAGE_VIEWER_EXTS.has(ext);
}

function extFromPath(filePath: string): string {
  const m = filePath.match(/\.([^./]+)$/);
  return m ? m[1].toLowerCase() : '';
}

const MIME_MAP: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
  tiff: 'image/tiff', tif: 'image/tiff',
};

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

// ── Table Checkbox Utilities ────────────────────────────────

interface CheckboxPosition {
  lineIndex: number;
  charIndex: number;
  checked: boolean;
}

function findTableCheckboxes(content: string): CheckboxPosition[] {
  const positions: CheckboxPosition[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trimStart().startsWith('|')) continue;
    if (/^\s*\|[\s\-:|]+\|\s*$/.test(line)) continue;
    let searchStart = 0;
    while (true) {
      const unchecked = line.indexOf('[ ]', searchStart);
      const checked = line.indexOf('[x]', searchStart);
      let idx = -1;
      let isChecked = false;
      if (unchecked >= 0 && (checked < 0 || unchecked < checked)) { idx = unchecked; }
      else if (checked >= 0) { idx = checked; isChecked = true; }
      if (idx < 0) break;
      positions.push({ lineIndex: i, charIndex: idx, checked: isChecked });
      searchStart = idx + 3;
    }
  }
  return positions;
}

function toggleCheckboxInContent(content: string, pos: CheckboxPosition): string {
  const lines = content.split('\n');
  const line = lines[pos.lineIndex];
  const replacement = pos.checked ? '[ ]' : '[x]';
  lines[pos.lineIndex] = line.substring(0, pos.charIndex) + replacement + line.substring(pos.charIndex + 3);
  return lines.join('\n');
}

function addTableCheckboxesToHtml(html: string): string {
  let idx = 0;
  return html.replace(/<td([^>]*)>([\s\S]*?)<\/td>/gi, (match, attrs, cellContent) => {
    let modified = false;
    const processed = cellContent.replace(/\[([ x])\]/g, (_: string, state: string) => {
      modified = true;
      const checked = state === 'x';
      return `<input type="checkbox" class="laguz-table-cb" data-cb-idx="${idx++}" ${checked ? 'checked' : ''} />`;
    });
    return modified ? `<td${attrs}>${processed}</td>` : match;
  });
}

// ── Wiki-Link Utilities ─────────────────────────────────────

function addWikiLinksToHtml(html: string, folderNames: Set<string>): string {
  return html.replace(/\[\[([^\]]+)\]\]/g, (_, target) => {
    const isFolder = folderNames.has(target);
    const icon = isFolder ? '\uD83D\uDCC1' : '\uD83D\uDCC4';
    const cls = isFolder ? 'laguz-wikilink laguz-wikilink-folder' : 'laguz-wikilink laguz-wikilink-note';
    return `<a class="${cls}" data-wiki-target="${encodeURIComponent(target)}" href="#">${icon} ${target}</a>`;
  });
}

// ── Attachment Drop Helper ──────────────────────────────────

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']);
const INLINE_TEXT_EXTS = new Set(['txt', 'md', 'csv']);

interface DropResult {
  links: string[];
  inlineContent?: string;
  /** Vault-relative paths of any PDFs that were attached */
  pdfPaths: string[];
  /** Vault-relative paths of all attached files */
  allPaths: string[];
}

async function processDroppedFiles(files: FileList): Promise<DropResult> {
  const links: string[] = [];
  const pdfPaths: string[] = [];
  const allPaths: string[] = [];
  let inlineContent: string | undefined;

  for (const file of Array.from(files)) {
    const filePath = window.laguz.getPathForFile(file);
    if (!filePath) continue;

    const ext = filePath.split('.').pop()?.toLowerCase() || '';

    if (INLINE_TEXT_EXTS.has(ext)) {
      const shouldInline = confirm(
        `Insert content of "${file.name}" directly?\n\nOK = inline the text content\nCancel = insert as attachment link`
      );
      if (shouldInline) {
        const { content } = await window.laguz.readExternalFile(filePath);
        inlineContent = (inlineContent ? inlineContent + '\n\n' : '') + content;
        continue;
      }
    }

    const result = await window.laguz.copyAttachment(filePath);
    allPaths.push(result.path);

    if (ext === 'pdf') {
      pdfPaths.push(result.path);
      links.push(`[${result.filename}](${result.path})`);
    } else {
      const link = IMAGE_EXTS.has(ext)
        ? `![${result.filename}](${result.path})`
        : `[${result.filename}](${result.path})`;
      links.push(link);
    }
  }

  return { links, inlineContent, pdfPaths, allPaths };
}

// ── Rendered Markdown Viewer ────────────────────────────────

function NoteViewer({ content, notePath, onContentChange, folderNames, onFolderNavigate, onNoteNavigate, onPdfOpen }: {
  content: string;
  notePath?: string;
  onContentChange?: (content: string) => void;
  folderNames?: Set<string>;
  onFolderNavigate?: (folderName: string) => void;
  onNoteNavigate?: (noteName: string) => void;
  onPdfOpen?: (pdfPath: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { html, checkboxPositions } = useMemo(() => {
    const body = stripFrontmatter(content);
    let rendered = marked.parse(body, { async: false }) as string;
    const positions = findTableCheckboxes(content);
    rendered = addTableCheckboxesToHtml(rendered);
    rendered = addWikiLinksToHtml(rendered, folderNames ?? new Set());
    return { html: rendered, checkboxPositions: positions };
  }, [content, folderNames]);

  useEffect(() => {
    if (!containerRef.current) return;

    const handleCheckboxChange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (!target.classList.contains('laguz-table-cb')) return;
      e.preventDefault();
      const idx = parseInt(target.dataset.cbIdx || '0', 10);
      const pos = checkboxPositions[idx];
      if (!pos) return;
      const newContent = toggleCheckboxInContent(content, pos);
      onContentChange?.(newContent);
      if (notePath) {
        window.laguz.writeNote(notePath, newContent).catch(console.error);
      }
    };

    const handleClick = (e: Event) => {
      // Wiki-link clicks
      const wikiAnchor = (e.target as HTMLElement).closest('.laguz-wikilink') as HTMLAnchorElement | null;
      if (wikiAnchor) {
        e.preventDefault();
        const target = decodeURIComponent(wikiAnchor.dataset.wikiTarget || '');
        if (!target) return;
        if (/\.pdf$/i.test(target)) {
          onPdfOpen?.(target);
          return;
        }
        if (wikiAnchor.classList.contains('laguz-wikilink-folder')) {
          onFolderNavigate?.(target);
        } else {
          onNoteNavigate?.(target);
        }
        return;
      }

      // Regular link clicks — check for PDF links
      const anchor = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null;
      if (anchor && !anchor.classList.contains('laguz-wikilink')) {
        const href = anchor.getAttribute('href') || '';
        if (/\.pdf$/i.test(href) && !href.startsWith('http')) {
          e.preventDefault();
          onPdfOpen?.(href);
        }
      }
    };

    const el = containerRef.current;
    el.addEventListener('change', handleCheckboxChange);
    el.addEventListener('click', handleClick);
    return () => {
      el.removeEventListener('change', handleCheckboxChange);
      el.removeEventListener('click', handleClick);
    };
  }, [html, checkboxPositions, content, notePath, onContentChange, onFolderNavigate, onNoteNavigate, onPdfOpen]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto scrollbar-hide px-6 py-4">
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

// ── CodeMirror Table Checkbox Extension ─────────────────────

class TableCheckboxWidget extends WidgetType {
  constructor(private checked: boolean) { super(); }

  toDOM() {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.checked;
    input.className = 'cm-table-checkbox';
    return input;
  }

  eq(other: TableCheckboxWidget) { return this.checked === other.checked; }
  ignoreEvent() { return false; }
}

const tableCheckboxPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = this.build(view); }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.build(update.view);
    }
  }

  build(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos);
        const text = line.text;
        if (text.trimStart().startsWith('|') && !/^\s*\|[\s\-:|]+\|\s*$/.test(text)) {
          let searchStart = 0;
          while (true) {
            const unchecked = text.indexOf('[ ]', searchStart);
            const checked = text.indexOf('[x]', searchStart);
            let idx = -1;
            let isChecked = false;
            if (unchecked >= 0 && (checked < 0 || unchecked < checked)) { idx = unchecked; }
            else if (checked >= 0) { idx = checked; isChecked = true; }
            if (idx < 0) break;
            builder.add(line.from + idx, line.from + idx + 3,
              Decoration.replace({ widget: new TableCheckboxWidget(isChecked) }));
            searchStart = idx + 3;
          }
        }
        pos = line.to + 1;
      }
    }
    return builder.finish();
  }
}, {
  decorations: v => v.decorations,
  eventHandlers: {
    mousedown(e, view) {
      const target = e.target as HTMLElement;
      if (!(target instanceof HTMLInputElement) || !target.classList.contains('cm-table-checkbox')) return false;
      e.preventDefault();
      const pos = view.posAtDOM(target);
      const line = view.state.doc.lineAt(pos);
      const col = pos - line.from;
      const snippet = line.text.substring(col, col + 3);
      if (snippet === '[ ]' || snippet === '[x]') {
        view.dispatch({
          changes: { from: line.from + col, to: line.from + col + 3, insert: snippet === '[x]' ? '[ ]' : '[x]' },
        });
      }
      return true;
    },
  },
});

// ── CodeMirror Wiki-Link Decoration ─────────────────────────

class WikiLinkWidget extends WidgetType {
  constructor(private target: string, private isFolder: boolean) { super(); }

  toDOM() {
    const span = document.createElement('span');
    span.className = this.isFolder ? 'cm-wikilink cm-wikilink-folder' : 'cm-wikilink';
    const icon = this.isFolder ? '\uD83D\uDCC1 ' : '';
    span.textContent = `${icon}${this.target}`;
    span.dataset.wikiTarget = this.target;
    return span;
  }

  eq(other: WikiLinkWidget) { return this.target === other.target && this.isFolder === other.isFolder; }
  ignoreEvent() { return false; }
}

function makeWikiLinkPlugin(folderNames: Set<string>) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = this.build(view); }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const re = /\[\[([^\]]+)\]\]/g;
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const line = view.state.doc.lineAt(pos);
          let match;
          re.lastIndex = 0;
          while ((match = re.exec(line.text)) !== null) {
            const target = match[1];
            const isFolder = folderNames.has(target);
            const absFrom = line.from + match.index;
            const absTo = absFrom + match[0].length;
            builder.add(absFrom, absTo,
              Decoration.replace({ widget: new WikiLinkWidget(target, isFolder) }));
          }
          pos = line.to + 1;
        }
      }
      return builder.finish();
    }
  }, { decorations: v => v.decorations });
}

// ── CodeMirror Editor Component ─────────────────────────────

interface CursorInfo {
  line: number;
  col: number;
  selections: number;
}

function NoteEditor({ content, notePath, onContentChange, onDone, isMd = true, showLineNumbers = 'auto', folderNames, onRegisterInsert }: {
  content: string;
  notePath: string;
  onContentChange: (content: string) => void;
  onDone: () => void;
  isMd?: boolean;
  showLineNumbers?: 'auto' | 'on' | 'off';
  folderNames?: Set<string>;
  onRegisterInsert?: (fn: (text: string) => void) => void;
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
          tableCheckboxPlugin,
          makeWikiLinkPlugin(folderNames ?? new Set()),
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

  useEffect(() => {
    onRegisterInsert?.((text: string) => {
      const view = viewRef.current;
      if (!view) return;
      const pos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, insert: text },
        selection: { anchor: pos + text.length },
      });
    });
  }, [notePath, onRegisterInsert]);

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

function MarkdownDetail({ notePath, onMarkProcessed, onFolderNavigate, onNoteNavigate }: {
  notePath: string;
  onMarkProcessed?: () => void;
  onFolderNavigate?: (folderName: string) => void;
  onNoteNavigate?: (noteName: string) => void;
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
  const [saveAsStatus, setSaveAsStatus] = useState<string | null>(null);

  useEffect(() => { setEditing(false); setLinkedPdf(null); setSaveAsOpen(false); }, [notePath]);

  useEffect(() => {
    window.laguz.getVaultFolders().then(folders => {
      setFolderNames(new Set(folders.map(f => f.name)));
    }).catch(() => {});
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

  const handleContentChange = useCallback(() => { refresh(); }, [refresh]);
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
      setSaveAsStatus('Saved');
      setTimeout(() => setSaveAsStatus(null), 2000);
    } catch (e) {
      console.error('Failed to save copy:', e);
    }
  }, [note]);

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
          onContentChange={handleContentChange}
          onDone={handleDoneEditing}
          isMd
          showLineNumbers={editorConfig.lineNumbers}
          folderNames={folderNames}
          onRegisterInsert={(fn) => { editorInsertRef.current = fn; }}
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

// ── Generic FileDetail (non-indexed text files) ──────────────

function FileDetail({ filePath }: { filePath: string }) {
  const { file, loading, refresh } = useFile(filePath);
  const editorConfig = useEditorConfig();
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsStatus, setSaveAsStatus] = useState<string | null>(null);

  const handleContentChange = useCallback(() => { refresh(); }, [refresh]);

  const filename = filePath.split('/').pop() || filePath;
  const ext = extFromPath(filePath).toUpperCase() || 'TXT';

  const handleSaveAs = useCallback(async (targetPath: string) => {
    if (!file || !targetPath.trim()) return;
    try {
      await window.laguz.writeFile(targetPath.trim(), file.content);
      setSaveAsOpen(false);
      setSaveAsStatus('Saved');
      setTimeout(() => setSaveAsStatus(null), 2000);
    } catch (e) {
      console.error('Failed to save copy:', e);
    }
  }, [file]);

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
        onContentChange={handleContentChange}
        onDone={() => {}}
        isMd={false}
        showLineNumbers={editorConfig.lineNumbers}
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

// ── HTML Detail (code + preview toggle) ──────────────────────

function HtmlDetail({ filePath }: { filePath: string }) {
  const { file, loading, refresh } = useFile(filePath);
  const editorConfig = useEditorConfig();
  const [mode, setMode] = useState<'preview' | 'code'>('preview');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsStatus, setSaveAsStatus] = useState<string | null>(null);

  const handleContentChange = useCallback(() => { refresh(); }, [refresh]);

  const handleSaveAs = useCallback(async (targetPath: string) => {
    if (!file || !targetPath.trim()) return;
    try {
      await window.laguz.writeFile(targetPath.trim(), file.content);
      setSaveAsOpen(false);
      setSaveAsStatus('Saved');
      setTimeout(() => setSaveAsStatus(null), 2000);
    } catch (e) {
      console.error('Failed to save copy:', e);
    }
  }, [file]);

  const filename = filePath.split('/').pop() || filePath;

  useEffect(() => { setMode('preview'); setSaveAsOpen(false); }, [filePath]);

  // Write content into the iframe via srcdoc whenever file changes in preview mode
  const srcdoc = useMemo(() => {
    if (!file) return '';
    return file.content;
  }, [file]);

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
          onContentChange={handleContentChange}
          onDone={() => setMode('preview')}
          isMd={false}
          showLineNumbers={editorConfig.lineNumbers}
        />
      ) : (
        <div className="flex-1 overflow-hidden bg-white">
          <iframe
            ref={iframeRef}
            srcDoc={srcdoc}
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

// ── DOCX Detail ──────────────────────────────────────────────

function DocxDetail({ filePath }: { filePath: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [pdfPath, setPdfPath] = useState<string | null>(null);

  const filename = filePath.split('/').pop() || filePath;

  useEffect(() => {
    setHtml(null);
    setError(null);
    setPdfPath(null);
    window.laguz.readDocxHtml(filePath).then((res) => {
      setHtml(res.html);
    }).catch((e: any) => {
      setError(e.message || 'Failed to load DOCX');
    });
  }, [filePath]);

  const handleConvertToPdf = useCallback(async () => {
    setConverting(true);
    try {
      const result = await window.laguz.convertDocxToPdf(filePath);
      setPdfPath(result.pdfPath);
    } catch (e: any) {
      alert(`Conversion failed: ${e.message}`);
    } finally {
      setConverting(false);
    }
  }, [filePath]);

  if (pdfPath) {
    return <PdfDetail filePath={pdfPath} />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-text-primary font-mono">{filename}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleConvertToPdf}
              disabled={converting || !html}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors"
              style={{
                background: converting ? 'rgba(74, 168, 154, 0.08)' : 'rgba(74, 168, 154, 0.15)',
                color: '#4AA89A',
                opacity: converting || !html ? 0.6 : 1,
              }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              {converting ? 'Converting...' : 'Convert to PDF'}
            </button>
            <span className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider"
              style={{ background: 'rgba(92, 184, 165, 0.12)', color: '#5CB8A5' }}
            >
              DOCX
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted">
          <span>{filePath}</span>
          <span>Convert to PDF to annotate and sign</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-4">
        {error ? (
          <div className="text-red-400 text-sm">{error}</div>
        ) : html ? (
          <div className="prose-laguz" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="text-text-muted text-sm">Loading document...</div>
        )}
      </div>

      <div className="h-6 flex items-center px-3 gap-4 border-t border-border-subtle bg-bg-secondary text-[10px] text-text-muted flex-shrink-0 select-none">
        <span>DOCX</span>
        <div className="flex-1" />
        {pdfPath === null && <span>Convert to PDF for annotations & signatures</span>}
      </div>
    </div>
  );
}

// ── Image Detail ─────────────────────────────────────────────

function ImageDetail({ filePath }: { filePath: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filename = filePath.split('/').pop() || filePath;
  const ext = extFromPath(filePath);

  useEffect(() => {
    setDataUrl(null);
    setError(null);
    window.laguz.readFileBase64(filePath).then((b64) => {
      const mime = MIME_MAP[ext] || 'application/octet-stream';
      setDataUrl(`data:${mime};base64,${b64}`);
    }).catch((e: any) => {
      setError(e.message || 'Failed to load image');
    });
  }, [filePath, ext]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-text-primary font-mono">{filename}</h1>
          <span className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider"
            style={{ background: 'rgba(92, 184, 165, 0.12)', color: '#5CB8A5' }}
          >
            {ext.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted">
          <span>{filePath}</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto scrollbar-hide flex items-start justify-center p-6 bg-[#1a1a2e]">
        {error ? (
          <div className="text-red-400 text-sm">{error}</div>
        ) : dataUrl ? (
          <img src={dataUrl} alt={filename} className="max-w-full object-contain rounded shadow-lg" style={{ maxHeight: '90vh' }} />
        ) : (
          <div className="text-text-muted text-sm">Loading image...</div>
        )}
      </div>
    </div>
  );
}

// ── Save As Dialog ───────────────────────────────────────────

function SaveAsDialog({ defaultPath, onSave, onCancel }: {
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

// ── Smart Router ─────────────────────────────────────────────

interface NoteDetailProps {
  notePath: string | null;
  onMarkProcessed?: () => void;
  onFolderNavigate?: (folderName: string) => void;
  onNoteNavigate?: (noteName: string) => void;
}

export function NoteDetail({ notePath, onMarkProcessed, onFolderNavigate, onNoteNavigate }: NoteDetailProps) {
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

  if (isPdf(notePath)) {
    return <PdfDetail filePath={notePath} />;
  }

  if (isDocx(notePath)) {
    return <DocxDetail filePath={notePath} />;
  }

  if (isHtml(notePath)) {
    return <HtmlDetail filePath={notePath} />;
  }

  if (isImage(notePath)) {
    return <ImageDetail filePath={notePath} />;
  }

  if (isMarkdown(notePath)) {
    return <MarkdownDetail notePath={notePath} onMarkProcessed={onMarkProcessed} onFolderNavigate={onFolderNavigate} onNoteNavigate={onNoteNavigate} />;
  }

  return <FileDetail filePath={notePath} />;
}
