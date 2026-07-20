import React, { useCallback, useRef, useEffect, useState } from 'react';
import { EditorView, keymap, drawSelection, highlightActiveLine, lineNumbers, ViewUpdate } from '@codemirror/view';
import { EditorState, Prec, Extension } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { codeFolding, foldKeymap } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { extFromPath } from './fileTypes';
import {
  laguzHighlightExt, codeHighlightExt, FrontmatterWidget, frontmatterFoldService,
  frontmatterDecoPlugin, autoFoldFrontmatter, tableCheckboxPlugin, makeWikiLinkPlugin,
  languageExtForFile, openCmSearchPanel,
} from './editorExtensions';

// ── CodeMirror editor with autosave ─────────────────────────

interface CursorInfo {
  line: number;
  col: number;
  selections: number;
}

export type SaveState = 'saved' | 'saving' | 'modified';

export function NoteEditor({ content, notePath, onDone, isMd = true, showLineNumbers = 'auto', folderNames, onRegisterInsert, onDirtyChange, onContentChange }: {
  content: string;
  notePath: string;
  onDone: () => void;
  isMd?: boolean;
  showLineNumbers?: 'auto' | 'on' | 'off';
  folderNames?: Set<string>;
  onRegisterInsert?: (fn: (text: string) => void) => void;
  /** Notified whenever the buffer transitions between saved and unsaved. */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * Called with the just-saved content after each successful write. This does
   * NOT trigger a disk re-read — callers use it to keep an in-memory view (e.g.
   * an HTML preview) in sync without the wasteful mid-edit refetch.
   */
  onContentChange?: (content: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSavedRef = useRef(content);
  const [saveStatus, setSaveStatus] = useState<SaveState>('saved');
  const [docStats, setDocStats] = useState({ lines: 0, words: 0, chars: 0 });
  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, col: 1, selections: 1 });

  const saveFn = isMd ? window.laguz.writeNote : window.laguz.writeFile;

  // Keep the latest onDirtyChange without re-running the editor mount effect.
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => { onDirtyChangeRef.current = onDirtyChange; }, [onDirtyChange]);
  useEffect(() => { onDirtyChangeRef.current?.(saveStatus !== 'saved'); }, [saveStatus]);

  const onContentChangeRef = useRef(onContentChange);
  useEffect(() => { onContentChangeRef.current = onContentChange; }, [onContentChange]);

  const save = useCallback((newContent: string) => {
    if (newContent === lastSavedRef.current) return;
    setSaveStatus('saving');
    saveFn(notePath, newContent).then(() => {
      lastSavedRef.current = newContent;
      setSaveStatus('saved');
      onContentChangeRef.current?.(newContent);
    }).catch((e: any) => {
      console.error('Failed to save:', e);
      setSaveStatus('modified');
    });
  }, [notePath, saveFn]);

  const debouncedSave = useCallback((newContent: string) => {
    setSaveStatus('modified');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(newContent), 500);
  }, [save]);

  const openFindPanel = useCallback(() => {
    if (viewRef.current) openCmSearchPanel(viewRef.current, 'find');
  }, []);

  const openReplacePanel = useCallback(() => {
    if (viewRef.current) openCmSearchPanel(viewRef.current, 'replace');
  }, []);

  const openRegexReplacePanel = useCallback(() => {
    if (viewRef.current) openCmSearchPanel(viewRef.current, 'regex');
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        const text = update.state.doc.toString();
        debouncedSave(text);
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

    const findKeymap = keymap.of([
      {
        key: 'Mod-Shift-f',
        run: () => { openReplacePanel(); return true; },
      },
      {
        key: 'Mod-Alt-f',
        run: () => { openRegexReplacePanel(); return true; },
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
      Prec.high(findKeymap),
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
        highlightExt = laguzHighlightExt;
      } else {
        langExt = await languageExtForFile(notePath);
        highlightExt = codeHighlightExt;
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
          saveFn(notePath, currentContent).catch((e) => console.error('[NoteEditor] Save on unmount failed:', e));
        }
      }
      viewRef.current?.destroy();
      viewRef.current = null;
      // Leaving the editor flushes any pending write, so the tab is clean again.
      onDirtyChangeRef.current?.(false);
    };
  }, [notePath, openReplacePanel, openRegexReplacePanel]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <button
          onClick={openFindPanel}
          className="px-2 py-0.5 rounded text-[10px] border border-border-subtle text-text-muted hover:text-text-primary hover:border-accent-primary/40 transition-colors"
          title="Find (Cmd/Ctrl+F)"
        >
          Find
        </button>
        <button
          onClick={openReplacePanel}
          className="px-2 py-0.5 rounded text-[10px] border border-border-subtle text-text-muted hover:text-text-primary hover:border-accent-primary/40 transition-colors"
          title="Replace (Cmd/Ctrl+Shift+F). Tip: select a block first, then use Replace All."
        >
          Replace
        </button>
        <button
          onClick={openRegexReplacePanel}
          className="px-2 py-0.5 rounded text-[10px] border border-border-subtle text-text-muted hover:text-text-primary hover:border-accent-primary/40 transition-colors"
          title="Regex replace (Cmd/Ctrl+Alt+F)"
        >
          Regex
        </button>
        <span>{langLabel}</span>
        <span>UTF-8</span>
        <span className={saveStatus === 'saving' ? 'text-accent-primary' : saveStatus === 'modified' ? 'text-amber-400' : 'text-text-muted'}>
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'modified' ? '● Unsaved' : 'Saved'}
        </span>
      </div>
    </div>
  );
}
