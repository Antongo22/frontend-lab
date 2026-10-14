import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';
import { basicSetup } from 'codemirror';
export default function Editor({ value, onChange, language, onRun }: { value: string; onChange: (value: string) => void; language: string; onRun: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callback = useRef(onChange); callback.current = onChange;
  const run = useRef(onRun); run.current = onRun;
  useEffect(() => {
    const syntax = language === 'css' ? css() : language === 'html' ? html() : javascript({ typescript: language === 'ts' || language === 'react', jsx: language === 'react' });
    const editor = new EditorView({ parent: container.current!, state: EditorState.create({ doc: value, extensions: [basicSetup, oneDark, syntax, keymap.of([{ key: 'Mod-Enter', run: () => { run.current(); return true; } }]), EditorView.contentAttributes.of({ 'aria-label': 'Редактор кода', spellcheck: 'false' }), EditorView.updateListener.of(update => { if (update.docChanged) callback.current(update.state.doc.toString()); }), EditorView.theme({ '&': { height: '100%', fontSize: '12px', backgroundColor: '#20262e' }, '.cm-scroller': { fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', lineHeight: '1.9', overflow: 'auto' }, '.cm-content': { padding: '20px 0' }, '.cm-line': { paddingLeft: '10px' }, '.cm-gutters': { backgroundColor: '#20262e', border: 'none', color: '#617080', paddingLeft: '6px' }, '.cm-activeLine': { backgroundColor: '#ffffff04' }, '.cm-activeLineGutter': { backgroundColor: 'transparent' }, '&.cm-focused': { outline: 'none' } })] }) });
    view.current = editor;
    return () => { editor.destroy(); view.current = null; };
  }, [language]); // A file switch remounts this component via its key.
  useEffect(() => { const editor = view.current; if (editor && editor.state.doc.toString() !== value) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } }); }, [value]);
  return <div className="code-editor" ref={container} />;
}
