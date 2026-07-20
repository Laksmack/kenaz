import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view';
import { EditorState, Extension } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { foldKeymap } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { laguzHighlightExt, openCmSearchPanel } from './detail/editorExtensions';

export interface ScratchEditorHandle {
  openSearch: (mode?: 'find' | 'replace' | 'regex') => void;
  focus: () => void;
}

/**
 * CodeMirror-backed editor for scratch buffers. Unlike NoteEditor it does not
 * touch disk — it just reports edits via onChange so ScratchView can persist to
 * localStorage. Gives scratch undo history, markdown highlighting and the same
 * native find/replace panel the note editor uses.
 *
 * Mount one per tab (via `key`); the initial content is read once at mount and
 * the editor becomes the source of truth while focused.
 */
export const ScratchEditor = forwardRef<ScratchEditorHandle, {
  initialContent: string;
  onChange: (content: string) => void;
}>(function ScratchEditor({ initialContent, onChange }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useImperativeHandle(ref, () => ({
    openSearch: (mode = 'find') => { if (viewRef.current) openCmSearchPanel(viewRef.current, mode); },
    focus: () => viewRef.current?.focus(),
  }), []);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) onChangeRef.current(update.state.doc.toString());
    });

    // Cmd+S is handled by ScratchView's window listener (works whether or not
    // the editor is focused), so it is deliberately not bound here.
    const extensions: Extension[] = [
      history(),
      EditorState.allowMultipleSelections.of(true),
      drawSelection(),
      highlightActiveLine(),
      search({ top: true }),
      highlightSelectionMatches(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap, indentWithTab]),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      laguzHighlightExt,
      updateListener,
      EditorView.lineWrapping,
    ];

    const view = new EditorView({
      state: EditorState.create({ doc: initialContent, extensions }),
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // initialContent intentionally excluded: the editor owns its content after
    // mount; a new tab remounts via `key`.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="h-full overflow-y-auto scrollbar-hide px-4 py-3 text-sm leading-relaxed" />;
});
