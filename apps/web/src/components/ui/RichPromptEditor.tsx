import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state';
import { normalizePromptDocument, promptDocumentsEqual, type PromptDocument, type PromptVariable } from '@dongxuan/dto';
import { Button } from './controls';
import type { PromptEditorHandle } from './prompt-editor-handle';
import { asEditorContent, createPromptEditorExtensions, sanitizePromptHTML, type PromptLabels } from './prompt-editor-extensions';

export function RichPromptEditor({ value, variables, handleRef, disabled, onChange, onOpenVariables, onError, onPasteNotice }: {
  value: PromptDocument;
  variables: PromptVariable[];
  handleRef: Ref<PromptEditorHandle>;
  disabled: boolean;
  onChange: (value: PromptDocument) => void;
  onOpenVariables: () => void;
  onError: (message: string) => void;
  onPasteNotice: () => void;
}) {
  const labels = useRef<PromptLabels>({ variables, listeners: new Set() });
  const callbacks = useRef({ onChange, onError, onPasteNotice });
  callbacks.current = { onChange, onError, onPasteNotice };
  const selection = useRef({ from: 1, to: 1 });
  const [selected, setSelected] = useState<{ type: string; raw?: string; name?: string } | null>(null);
  const [, refreshToolbar] = useState(0);
  const editor = useEditor({
    extensions: createPromptEditorExtensions(labels.current, message => callbacks.current.onError(message)),
    content: asEditorContent(value), immediatelyRender: false,
    editorProps: {
      attributes: { id: 'prompt-body', class: 'prompt-rich-content', role: 'textbox', 'aria-multiline': 'true', 'aria-label': '模板正文', 'aria-describedby': 'prompt-editor-help' },
      transformPastedHTML(html) {
        const clean = sanitizePromptHTML(html);
        if (clean.changed) callbacks.current.onPasteNotice();
        return clean.html;
      },
    },
    onUpdate({ editor: current, transaction }) {
      if (!transaction.docChanged || current.view.composing) return;
      try { callbacks.current.onChange(normalizePromptDocument({ schemaVersion: 1, doc: current.getJSON() })); }
      catch (error) { callbacks.current.onError(error instanceof Error ? error.message : '正文格式无效。'); }
    },
    onSelectionUpdate({ editor: current }) {
      selection.current = { from: current.state.selection.from, to: current.state.selection.to };
      const node = current.state.selection instanceof NodeSelection ? current.state.selection.node : null;
      setSelected(node && ['promptVariable', 'promptInvalidVariable'].includes(node.type.name) ? { type: node.type.name, ...node.attrs } : null);
      refreshToolbar(version => version + 1);
    },
    onTransaction() { refreshToolbar(version => version + 1); },
  });
  useEffect(() => {
    labels.current.variables = variables;
    labels.current.listeners.forEach(refresh => refresh());
  }, [variables]);
  useEffect(() => { editor?.setEditable(!disabled, false); }, [editor, disabled]);
  useEffect(() => {
    if (!editor || editor.view.composing) return;
    const current = normalizePromptDocument({ schemaVersion: 1, doc: editor.getJSON() });
    if (!promptDocumentsEqual(current, value)) {
      // Only explicit external changes (revert/import/remove) replace content.
      // Editor updates already match this JSON and never enter setContent.
      editor.commands.setContent(asEditorContent(value), { emitUpdate: false });
      const max = editor.state.doc.content.size;
      selection.current = { from: Math.min(selection.current.from, max), to: Math.min(selection.current.to, max) };
    }
  }, [editor, value]);
  useEffect(() => {
    if (!editor) return;
    selection.current = { from: editor.state.selection.from, to: editor.state.selection.to };
    const complete = () => queueMicrotask(() => {
      if (!editor.isDestroyed) callbacks.current.onChange(normalizePromptDocument({ schemaVersion: 1, doc: editor.getJSON() }));
    });
    editor.view.dom.addEventListener('compositionend', complete);
    return () => editor.view.dom.removeEventListener('compositionend', complete);
  }, [editor]);
  useImperativeHandle(handleRef, () => ({
    getDocument: () => editor ? normalizePromptDocument({ schemaVersion: 1, doc: editor.getJSON() }) : value,
    isComposing: () => Boolean(editor?.view.composing),
    rememberSelection() { if (editor) selection.current = { from: editor.state.selection.from, to: editor.state.selection.to }; },
    focusSelection() {
      if (!editor || editor.isDestroyed) return;
      const { from, to } = selection.current;
      const doc = editor.state.doc, max = doc.content.size;
      const anchor = doc.resolve(Math.min(from, max)), head = doc.resolve(Math.min(to, max));
      const node = doc.nodeAt(anchor.pos);
      const isReference = node && ['promptVariable', 'promptInvalidVariable'].includes(node.type.name);
      const restore = isReference && to === from + node.nodeSize ? NodeSelection.create(doc, anchor.pos) : anchor.parent.inlineContent && head.parent.inlineContent ? TextSelection.create(doc, anchor.pos, head.pos) : Selection.near(anchor);
      editor.view.dispatch(editor.state.tr.setSelection(restore)); editor.view.focus();
    },
    insertVariable(name) {
      if (!editor || editor.view.composing) return;
      editor.chain().insertContentAt(selection.current, { type: 'promptVariable', attrs: { name } }).run();
      selection.current = { from: editor.state.selection.from, to: editor.state.selection.to };
    },
  }), [editor, value]);
  const action = (run: () => void) => { if (!disabled && editor && !editor.view.composing) run(); };
  return <div className={'prompt-rich-editor' + (disabled ? ' disabled' : '')}>
    <div className="prompt-format-toolbar" role="toolbar" aria-label="正文格式" onMouseDown={event => event.preventDefault()}>
      <Button size="sm" aria-label="加粗" aria-pressed={editor?.isActive('bold')} onClick={() => action(() => { editor!.chain().focus().toggleBold().run(); })}><strong>B</strong></Button>
      <Button size="sm" aria-label="斜体" aria-pressed={editor?.isActive('italic')} onClick={() => action(() => { editor!.chain().focus().toggleItalic().run(); })}><em>I</em></Button>
      <span className="prompt-format-separator" />
      {([1, 2, 3] as const).map(level => <Button size="sm" key={level} aria-label={level + ' 级标题'} aria-pressed={editor?.isActive('heading', { level })} onClick={() => action(() => { editor!.chain().focus().toggleHeading({ level }).run(); })}>H{level}</Button>)}
      <Button size="sm" aria-label="项目列表" aria-pressed={editor?.isActive('bulletList')} onClick={() => action(() => { editor!.chain().focus().toggleBulletList().run(); })}>• 列表</Button>
      <Button size="sm" aria-label="编号列表" aria-pressed={editor?.isActive('orderedList')} onClick={() => action(() => { editor!.chain().focus().toggleOrderedList().run(); })}>1. 列表</Button>
      <span className="prompt-format-separator" aria-hidden="true" />
      <Button size="sm" disabled={disabled || !editor} onClick={() => action(onOpenVariables)}>＋ 插入资料</Button>
      <span className="prompt-format-spacer" />
      <Button size="sm" aria-label="撤销" disabled={!editor?.can().undo()} onClick={() => action(() => { editor!.chain().focus().undo().run(); })}>↶</Button>
      <Button size="sm" aria-label="重做" disabled={!editor?.can().redo()} onClick={() => action(() => { editor!.chain().focus().redo().run(); })}>↷</Button>
    </div>
    <EditorContent className="prompt-rich-scroll" editor={editor} />
    {selected ? <div className="prompt-reference-actions" role="group" aria-label="所选资料引用">
      <span>{selected.type === 'promptInvalidVariable' ? '待修复引用' : variables.find(item => item.name === selected.name)?.label || '未识别资料'}</span>
      <Button size="sm" onClick={onOpenVariables}>重新选择资料</Button>
      {selected.type === 'promptInvalidVariable' ? <Button size="sm" onMouseDown={event => event.preventDefault()} onClick={() => action(() => { editor!.commands.insertContent({ type: 'text', text: selected.raw || '' }); })}>转为普通文字</Button> : null}
      <Button size="sm" onMouseDown={event => event.preventDefault()} onClick={() => action(() => { editor!.commands.deleteSelection(); })}>删除引用</Button>
    </div> : null}
  </div>;
}
