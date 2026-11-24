import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { importLegacyPrompt, normalizePromptDocument, promptDocumentToTemplateText, promptDocumentsEqual, promptVariableNames, renderPromptDocument } from '@dongxuan/dto';
import { createPromptEditorExtensions, sanitizePromptHTML, type PromptLabels } from '../src/components/ui/prompt-editor-extensions';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost', pretendToBeVisual: true });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'DOMParser', 'getComputedStyle', 'ShadowRoot', 'ClipboardEvent'] as const) {
  if (name in dom.window) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
}
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
// jsdom omits range geometry; provide neutral geometry for ProseMirror's scroll-to-selection.
Object.defineProperty(dom.window.Range.prototype, 'getClientRects', { value: () => [] });
Object.defineProperty(dom.window.Range.prototype, 'getBoundingClientRect', { value: () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) });
const editors: Editor[] = [];
const labels = (): PromptLabels => ({ variables: [{ name: 'range.label', label: '阳历月份范围', source: 'ziwei', status: 'available' }, { name: 'input.action', label: '近期拟定动作', source: 'input', status: 'available' }], listeners: new Set() });
function create(content = importLegacyPrompt('正文{{range.label}}尾部'), store = labels()) {
  const element = document.createElement('div'); document.body.append(element);
  const errors: string[] = [];
  const editor = new Editor({ element, extensions: createPromptEditorExtensions(store, message => errors.push(message)), content: content.doc });
  editors.push(editor);
  return { editor, store, errors, element, document: () => normalizePromptDocument({ schemaVersion: 1, doc: editor.getJSON() }) };
}
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); document.body.replaceChildren(); });

test('真实Tiptap JSON白名单：标题、列表、粗斜体和硬换行可以规范化', () => {
  const { editor, document: read } = create(importLegacyPrompt('内容'));
  editor.commands.setContent('<h2>标题</h2><p><strong>粗体</strong><em>斜体</em><br>换行</p><ol start="3"><li><p>编号</p></li></ol><ul><li><p>项目</p></li></ul>');
  const actual = editor.getJSON();
  const ordered = actual.content?.find(node => node.type === 'orderedList');
  assert.equal(ordered?.attrs?.type, null);
  assert.deepEqual(read().doc.content[2].attrs, { start: 3 });
  assert.equal(promptDocumentToTemplateText(read()), '标题\n\n粗体斜体\n换行\n\n3. 编号\n\n- 项目');
  for (const forbidden of ['blockquote', 'code', 'codeBlock', 'horizontalRule', 'link', 'strike', 'underline', 'trailingNode']) assert.ok(!editor.extensionManager.extensions.some(extension => extension.name === forbidden));
});

test('中文标签来自目录，更新标签不改变JSON、选区或历史', () => {
  const { editor, document: read, store, element } = create(importLegacyPrompt('前{{input.action}}后'));
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 2)));
  const before = read(), selection = editor.state.selection.toJSON();
  store.variables = store.variables.map(variable => variable.name === 'input.action' ? { ...variable, label: '新的动作名称' } : variable);
  store.listeners.forEach(refresh => refresh());
  assert.match(element.textContent!, /新的动作名称/);
  assert.equal(element.textContent!.includes('input.action'), false);
  assert.deepEqual(editor.state.selection.toJSON(), selection);
  assert.ok(promptDocumentsEqual(before, read()));
  const atom = read().doc.content[0].content?.[1];
  assert.deepEqual(atom?.attrs, { name: 'input.action' });
});

test('普通文字和粘贴的双括号保持字面值，富文本剪贴板保留name', () => {
  const first = create(importLegacyPrompt('资料{{range.label}}'));
  first.editor.commands.insertContentAt(1, '{{input.action}}');
  assert.deepEqual(promptVariableNames(first.document()), ['range.label']);
  const html = first.editor.getHTML();
  assert.match(html, /data-prompt-variable="range.label"/);
  assert.match(first.editor.getText(), /阳历月份范围/);
  assert.equal(first.editor.getText().includes('{{range.label}}'), false);
  const second = create(importLegacyPrompt(''));
  second.editor.commands.insertContent(sanitizePromptHTML(html).html);
  assert.deepEqual(promptVariableNames(second.document()), ['range.label']);
  assert.match(renderPromptDocument(second.document(), { 'range.label': '{{input.action}}' }), /\{\{input.action\}\}.*\{\{input.action\}\}/);
});

test('实际copy事件分别输出中文text和含稳定name的内部HTML', () => {
  const { editor } = create(importLegacyPrompt('{{range.label}}'));
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, editor.state.doc.content.size - 1)));
  const data = new Map<string, string>();
  const event = new dom.window.Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { clearData() { data.clear(); }, setData(type: string, value: string) { data.set(type, value); } } });
  editor.view.dom.dispatchEvent(event);
  assert.equal(data.get('text/plain'), '阳历月份范围');
  assert.match(data.get('text/html')!, /data-prompt-variable="range.label"/);
});

test('原子引用支持选中删除与undo/redo，保留周围文字', () => {
  const { editor, document: read } = create(importLegacyPrompt('前{{range.label}}后'));
  editor.commands.setNodeSelection(2); editor.commands.deleteSelection();
  assert.equal(promptDocumentToTemplateText(read()), '前后');
  editor.commands.undo(); assert.deepEqual(promptVariableNames(read()), ['range.label']);
  editor.commands.redo(); assert.deepEqual(promptVariableNames(read()), []);
});

test('外部HTML清除资源、事件属性、链接和字母编号且提供降级提示', () => {
  const clean = sanitizePromptHTML('<p onclick="alert(1)"><a href="https://x">文字</a><img src="https://x/a.png"><script>alert(1)</script></p><ol type="a"><li>条目</li></ol>');
  assert.equal(clean.changed, true);
  assert.doesNotMatch(clean.html, /onclick|href|img|src|script|type=/);
  const { editor, document: read } = create(importLegacyPrompt(''));
  editor.commands.setContent(clean.html);
  assert.match(promptDocumentToTemplateText(read()), /1\. 条目/);
  const limit = sanitizePromptHTML('<ol start="1000000"><li><p>最大编号</p></li></ol>');
  editor.commands.setContent(limit.html);
  assert.match(promptDocumentToTemplateText(read()), /1000000\. 最大编号/);
});

test('错误旧引用保留为错误atom，可显式转为普通文字并恢复正常保存形态', () => {
  const { editor, document: read } = create(importLegacyPrompt('前{{错误语法}}后'));
  assert.equal(read().doc.content[0].content?.[1].type, 'promptInvalidVariable');
  editor.commands.setNodeSelection(2);
  editor.commands.insertContent({ type: 'text', text: '{{错误语法}}' });
  assert.deepEqual(promptVariableNames(read()), []);
  assert.equal(renderPromptDocument(read(), {}), '前{{错误语法}}后');
});

test('真实编辑器拒绝超出投影预算的事务，保留之前正文并明确报错', () => {
  const { editor, document: read, errors } = create(importLegacyPrompt('原始正文'));
  editor.commands.insertContentAt(1, '字'.repeat(30001));
  assert.equal(promptDocumentToTemplateText(read()), '原始正文');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /30000|30,000|正文|字符|projection|text/i);
});

test('真实编辑器可往返超过旧1MiB HTTP上限的有界富文本JSON', () => {
  const content = Array.from({ length: 19000 }, (_, index) => ({ type: 'text' as const, text: '字', marks: index % 2 ? [{ type: 'bold' as const }] : [{ type: 'bold' as const }, { type: 'italic' as const }] }));
  const source = normalizePromptDocument({ schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content }] } });
  assert.ok(Buffer.byteLength(JSON.stringify(source)) > 1024 * 1024);
  const { document: read } = create(source);
  assert.ok(promptDocumentsEqual(source, read()));
  assert.equal(promptDocumentToTemplateText(read()).length, 19000);
});

test('React编辑器桥接在资料对话框失焦后恢复PM选区并插入原位置', async () => {
  const { createElement, createRef, act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { RichPromptEditor } = await import('../src/components/ui/RichPromptEditor');
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const handle = createRef<import('../src/components/ui/prompt-editor-handle').PromptEditorHandle>();
  const value = importLegacyPrompt('甲乙丙丁');
  try {
    await act(async () => { root.render(createElement(RichPromptEditor, { value, variables: labels().variables, handleRef: handle, disabled: false, onChange() {}, onOpenVariables() {}, onError(message: string) { throw new Error(message); }, onPasteNotice() {} })); });
    const paragraph = host.querySelector('#prompt-body p')!;
    await act(async () => {
      (host.querySelector('#prompt-body') as HTMLElement).focus();
      const range = document.createRange(); range.setStart(paragraph.firstChild!, 2); range.collapse(true);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new dom.window.Event('selectionchange')); await new Promise(resolve => setTimeout(resolve, 30));
    });
    handle.current!.rememberSelection();
    const dialogSearch = document.createElement('input'); document.body.append(dialogSearch); await act(async () => dialogSearch.focus());
    await act(async () => { handle.current!.insertVariable('range.label'); handle.current!.focusSelection(); });
    assert.equal(promptDocumentToTemplateText(handle.current!.getDocument()), '甲乙{{range.label}}丙丁');
    assert.equal(document.activeElement?.id, 'prompt-body');
    const before = handle.current!.getDocument();
    await act(async () => { root.render(createElement(RichPromptEditor, { value: before, variables: [{ name: 'range.label', label: '新的月份范围', source: 'ziwei', status: 'available' }], handleRef: handle, disabled: false, onChange() {}, onOpenVariables() {}, onError(message: string) { throw new Error(message); }, onPasteNotice() {} })); });
    assert.match(host.textContent!, /新的月份范围/);
    assert.ok(promptDocumentsEqual(before, handle.current!.getDocument()));
  } finally { await act(async () => root.unmount()); }
});

test('真实完整流月模板只打开React编辑器保持干净，重挂载与无变化flush不派生资料要求', async () => {
  const { createElement, createRef, act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { RichPromptEditor } = await import('../src/components/ui/RichPromptEditor');
  const { PromptsService } = await import('../src/pages/prompts/prompts.service');
  const { PROMPT_SEEDS } = await import('../../server/src/v2/prompt-seeds');
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const seed = PROMPT_SEEDS.find(template => template.seedKey === 'action-months')!;
  const { seedKey: _seedKey, ...input } = seed;
  const saved = { ...input, body: promptDocumentToTemplateText(input.bodyJson), id: '00000000-0000-4000-8000-000000000001', revision: 1, variableSchemaVersion: 1, createdAt: '', updatedAt: '' };
  const service = new PromptsService(); service.templates = [saved]; service.templatesLoaded = true; service.select(saved);
  const baseline = JSON.parse(JSON.stringify(service.draft)), handle = createRef<import('../src/components/ui/prompt-editor-handle').PromptEditorHandle>();
  service.attachEditor(() => handle.current);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const view = () => createElement(RichPromptEditor, { value: service.draft.bodyJson, variables: labels().variables, handleRef: handle, disabled: false, onChange: (bodyJson: typeof input.bodyJson) => service.change({ bodyJson }), onOpenVariables() {}, onError(message: string) { throw new Error(message); }, onPasteNotice() {} });
  try {
    assert.equal(service.dirty, false); assert.equal(service.hasDrafts, false);
    service.setMode('edit');
    await act(async () => { root.render(view()); });
    assert.equal(service.dirty, false); assert.equal(service.hasDrafts, false);
    assert.deepEqual(service.draft, baseline);
    // Actual ProseMirror history must also restore metadata after inserting a new reference.
    await act(async () => { handle.current!.rememberSelection(); handle.current!.insertVariable('ziwei.current'); handle.current!.focusSelection(); });
    assert.equal(service.dirty, true);
    assert.ok(service.draft.dataRequirements.includes('ziwei.current'));
    await act(async () => {
      const key = (metaKey: boolean) => new dom.window.KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', keyCode: 90, ctrlKey: !metaKey, metaKey, bubbles: true, cancelable: true });
      let event = key(false); host.querySelector('#prompt-body')!.dispatchEvent(event);
      if (!event.defaultPrevented) { event = key(true); host.querySelector('#prompt-body')!.dispatchEvent(event); }
      assert.equal(event.defaultPrevented, true, 'undo快捷键应被编辑器处理');
    });
    assert.ok(promptDocumentsEqual(service.draft.bodyJson, baseline.bodyJson));
    assert.equal(service.dirty, false); assert.equal(service.hasDrafts, false);
    assert.deepEqual(service.draft.dataRequirements, baseline.dataRequirements);
    // No-op editor notifications must not expand the seed's intentionally empty declaration.
    service.change({ bodyJson: handle.current!.getDocument() });
    assert.deepEqual(service.draft.dataRequirements, baseline.dataRequirements);
    assert.equal(service.hasDrafts, false);
    service.setMode('use'); await act(async () => root.render(null));
    service.setMode('edit'); await act(async () => root.render(view()));
    assert.equal(service.flushEditor(), true);
    assert.equal(service.dirty, false); assert.equal(service.hasDrafts, false);
    assert.deepEqual(service.draft, baseline);
  } finally { await act(async () => root.unmount()); service.attachEditor(null); }
});
