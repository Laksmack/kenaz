// ── CodeMirror extensions shared by the note / scratch editors ──
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { RangeSetBuilder, Extension } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle, foldEffect, foldedRanges, foldService, LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { openSearchPanel, getSearchQuery, setSearchQuery, SearchQuery } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { isMarkdown, extFromPath } from './fileTypes';

// ── Search panel helper (shared by note + scratch editors) ──
// Opens CodeMirror's built-in search panel and, for replace/regex modes,
// reveals the replace row / enables the regexp toggle and focuses the right
// field. Keeps find/replace/regex behaviour identical across both editors.

export function openCmSearchPanel(view: EditorView, mode: 'find' | 'replace' | 'regex' = 'find') {
  view.focus();
  openSearchPanel(view);

  if (mode === 'regex') {
    const query = getSearchQuery(view.state);
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({
        search: query.search,
        replace: query.replace,
        caseSensitive: query.caseSensitive,
        wholeWord: query.wholeWord,
        literal: query.literal,
        regexp: true,
      })),
    });
  }

  if (mode === 'find') return;

  queueMicrotask(() => {
    const toggle = view.dom.querySelector('.cm-search .cm-button') as HTMLButtonElement | null;
    if (toggle?.getAttribute('aria-pressed') !== 'true') {
      toggle?.click();
    }
    if (mode === 'regex') {
      const regexToggle = view.dom.querySelector('.cm-search input[name="regexp"]') as HTMLInputElement | null;
      if (regexToggle && !regexToggle.checked) {
        regexToggle.click();
      }
      (view.dom.querySelector('.cm-search input[name="search"]') as HTMLInputElement | null)?.focus();
    } else {
      (view.dom.querySelector('.cm-search input[name="replace"]') as HTMLInputElement | null)?.focus();
    }
  });
}

// ── Language resolution ─────────────────────────────────────

export async function languageExtForFile(filePath: string): Promise<Extension> {
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

// ── Highlight styles using Laguz CSS classes ────────────────

export const laguzHighlight = HighlightStyle.define([
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

export const codeHighlight = HighlightStyle.define([
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

export const laguzHighlightExt = syntaxHighlighting(laguzHighlight);
export const codeHighlightExt = syntaxHighlighting(codeHighlight);

// ── Frontmatter fold widget ─────────────────────────────────

export class FrontmatterWidget extends WidgetType {
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

export const frontmatterFoldService = foldService.of((state, lineStart) => {
  if (lineStart !== 0) return null;
  const range = findFrontmatterRange(state.doc);
  if (!range) return null;
  return { from: range.from, to: range.to };
});

export const frontmatterDecoPlugin = ViewPlugin.fromClass(class {
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

export function autoFoldFrontmatter(view: EditorView) {
  const range = findFrontmatterRange(view.state.doc);
  if (!range) return;
  queueMicrotask(() => {
    view.dispatch({ effects: foldEffect.of({ from: range.from, to: range.to }) });
  });
}

// ── Table checkbox widget ───────────────────────────────────

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

export const tableCheckboxPlugin = ViewPlugin.fromClass(class {
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

// ── Wiki-link decoration ────────────────────────────────────

class WikiLinkWidget extends WidgetType {
  constructor(private target: string, private isFolder: boolean) { super(); }

  toDOM() {
    const span = document.createElement('span');
    span.className = this.isFolder ? 'cm-wikilink cm-wikilink-folder' : 'cm-wikilink';
    const icon = this.isFolder ? '📁 ' : '';
    span.textContent = `${icon}${this.target}`;
    span.dataset.wikiTarget = this.target;
    return span;
  }

  eq(other: WikiLinkWidget) { return this.target === other.target && this.isFolder === other.isFolder; }
  ignoreEvent() { return false; }
}

export function makeWikiLinkPlugin(folderNames: Set<string>) {
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
