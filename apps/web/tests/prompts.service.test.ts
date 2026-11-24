import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { importLegacyPrompt, normalizePromptDocument, promptDocumentToTemplateText, promptVariableNames, type PromptPreview, type PromptTemplate } from '@dongxuan/dto';
import { PromptsService } from '../src/pages/prompts/prompts.service';
import { monthRange, validDate, writeClipboard } from '../src/pages/prompts/prompt-model';

const firstId = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';
const chartId = '00000000-0000-4000-8000-000000001001';
const base: PromptTemplate = {
  id: firstId, revision: 1, variableSchemaVersion: 1, createdAt: '', updatedAt: '',
  title: '流月行动排期', system: 'ziwei',
  body: '{{ziwei.natal}}\n{{ziwei.months}}\n{{input.action}}', bodyJson: importLegacyPrompt('{{ziwei.natal}}\n{{ziwei.months}}\n{{input.action}}'),
  inputsSchema: [{ key: 'action', label: '近期拟定动作', type: 'textarea', required: true }],
  dataRequirements: ['ziwei.natal', 'ziwei.months'],
};
const second: PromptTemplate = {
  ...base, id: secondId, title: '本次问题', body: '{{input.question}}', bodyJson: importLegacyPrompt('{{input.question}}'), dataRequirements: [],
  inputsSchema: [{ key: 'question', label: '问题', type: 'text', required: true }],
};
const response = (text: string, diagnostics: string[] = []): PromptPreview => ({
  text, diagnostics, sources: ['真实接口形状'], coverage: [], fingerprint: text, templateRevision: 1,
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function service() {
  const instance = new PromptsService();
  instance.templates = structuredClone([base, second]);
  instance.templatesLoaded = true;
  instance.select(instance.templates[0]);
  instance.chartId = chartId;
  instance.start = '2026-11';
  instance.setInputValue('action', '准备换工作');
  return instance;
}

const originalFetch = globalThis.fetch;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
beforeEach(() => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { search: '', origin: 'http://localhost' } } });
  globalThis.fetch = async () => { throw new Error('Unexpected request'); };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else Reflect.deleteProperty(globalThis, 'navigator');
});

test('编辑草稿按模板独立保留，使用模式始终取已保存版本', () => {
  const s = service();
  s.setMode('edit'); s.change({ title: '草稿标题', bodyJson: importLegacyPrompt('草稿内容') });
  assert.equal(promptDocumentToTemplateText(s.usage.bodyJson), base.body);
  s.select(s.templates[1]); s.change({ title: '第二份草稿' });
  s.select(s.templates[0]);
  assert.equal(s.draft.title, '草稿标题');
  assert.equal(promptDocumentToTemplateText(s.draft.bodyJson), '草稿内容');
  assert.equal(s.usage.title, base.title);
  assert.equal(Object.keys(s.drafts).length, 2);
  s.revert();
  assert.equal(promptDocumentToTemplateText(s.draft.bodyJson), base.body);
  assert.equal(s.hasDraft(firstId), false);
  assert.equal(s.hasDraft(secondId), true);
});

test('新建只创建内存草稿，保存失败保留原文，首次列表加载不抢走草稿', async () => {
  const s = service();
  let requests = 0;
  globalThis.fetch = async () => { requests++; return json({ error: { message: '保存失败' } }, 500); };
  s.openNew(); s.newTitle = '自定义模板'; s.createDraft();
  const id = s.active;
  assert.equal(s.isNew, true);
  assert.equal(requests, 0);
  s.selectInitial(null);
  assert.equal(s.active, id);
  s.change({ bodyJson: importLegacyPrompt('保留这段正文') });
  await s.save();
  assert.equal(requests, 1);
  assert.equal(promptDocumentToTemplateText(s.draft.bodyJson), '保留这段正文');
  assert.equal(s.hasDraft(id!), true);
  assert.match(s.editErrors[0], /保存失败/);
});

test('晚到的旧预览不能覆盖更晚请求生成的结果', async () => {
  const s = service(), first = deferred<Response>(), next = deferred<Response>();
  let requests = 0;
  globalThis.fetch = async () => ++requests === 1 ? first.promise : next.promise;
  const earlier = s.generate();
  s.setInputValue('action', '修改后的动作');
  const later = s.generate();
  next.resolve(json(response('新结果'))); await later;
  assert.equal(s.preview?.text, '新结果');
  first.resolve(json(response('旧结果'))); await earlier;
  assert.equal(s.preview?.text, '新结果');
  assert.equal(s.canCopy, true);
});

test('变更后保留旧结果，生成失败或返回诊断时仍禁止复制', async () => {
  const s = service();
  globalThis.fetch = async () => json(response('上一份完整结果'));
  await s.generate();
  s.setCount(6);
  assert.equal(s.preview?.text, '上一份完整结果');
  assert.equal(s.previewStale, true);
  assert.equal(s.canCopy, false);
  globalThis.fetch = async () => json(response('', ['某月份资料不完整']));
  await s.generate();
  assert.equal(s.preview?.text, '上一份完整结果');
  assert.equal(s.canCopy, false);
  assert.deepEqual(s.diagnostics, ['某月份资料不完整']);
});

test('换命盘会清空前一个人的填写和梅花绑定，并丢弃进行中的预览', async () => {
  const s = service(), pending = deferred<Response>();
  s.meihua = { id: 'draft', question: '前一个人的问题', numberA: 1, numberB: 2, chartId, status: 'raw', revision: 1, createdAt: '', updatedAt: '' };
  globalThis.fetch = async () => pending.promise;
  const generating = s.generate();
  s.selectChart(secondId);
  assert.deepEqual(s.values, {});
  assert.equal(s.meihua, null);
  pending.resolve(json(response('过期结果'))); await generating;
  assert.equal(s.preview, null);
  assert.equal(s.canCopy, false);
});

test('保存模板时切换到另一模板，不覆盖当前填写或当前结果', async () => {
  const s = service(), pending = deferred<Response>();
  s.change({ title: '已修改的模板标题' });
  globalThis.fetch = async () => pending.promise;
  const saving = s.save();
  s.select(s.templates[1]);
  s.setInputValue('question', '另一个模板的问题');
  s.preview = response('另一个模板的结果'); s.previewStale = false;
  pending.resolve(json({ ...base, title: '已修改的模板标题', revision: 2 })); await saving;
  assert.equal(s.active, secondId);
  assert.equal(s.values.question, '另一个模板的问题');
  assert.equal(s.preview.text, '另一个模板的结果');
  assert.equal(s.canCopy, true);
  assert.equal(s.templates[0].revision, 2);
  assert.equal(s.hasDraft(firstId), false);
});

test('修改范围后晚到的快照不重新建立旧绑定', async () => {
  const s = service(), pending = deferred<Response>();
  s.snapshotId = firstId;
  globalThis.fetch = async () => pending.promise;
  const loading = s.loadSnapshot(firstId, chartId);
  s.setStart('2027-01');
  pending.resolve(json({ id: firstId, chartId, query: { mode: 'months', startMonth: '2026-11', count: 3 } }));
  await loading;
  assert.equal(s.snapshotId, '');
  assert.equal(s.sourceSnapshot, null);
  assert.equal(s.start, '2027-01');
  assert.equal(s.sourceLoading, false);
});

test('未填写必填内容和非整数在请求前定位，选填留空仍发送服务端核验', async () => {
  const s = service();
  s.setInputValue('action', '');
  await s.generate();
  assert.equal(s.focusTarget, 'prompt-input-action');
  assert.match(s.fieldErrors['prompt-input-action'], /请填写/);
  s.templates[0] = { ...base, inputsSchema: [{ key: 'action', label: '数字', type: 'integer', required: true }] };
  s.setInputValue('action', '1.2'); await s.generate();
  assert.match(s.fieldErrors['prompt-input-action'], /整数/);
  s.templates[0] = { ...base, inputsSchema: [{ ...base.inputsSchema[0], required: false }] };
  s.setInputValue('action', '');
  let sent: Record<string, unknown> = {};
  globalThis.fetch = async (_url, init) => { sent = JSON.parse(String(init?.body)); return json(response('未提供')); };
  await s.generate();
  assert.equal(s.canCopy, true);
  assert.equal(sent.templateId, firstId);
  assert.equal(sent.revision, 1);
  assert.equal(Object.hasOwn(sent, 'draft'), false);
});

test('搜索遍历所有模板分页，能够找到第二页内容', async () => {
  const s = service();
  const page = Array.from({ length: 100 }, (_, i) => ({ ...base, id: 'page-' + i, title: '第一页-' + i }));
  let requests = 0;
  globalThis.fetch = async url => {
    requests++;
    return String(url).includes('cursor=next') ? json({ items: [{ ...second, title: '第二页模板' }], hasMore: false, nextCursor: null }) : json({ items: page, hasMore: true, nextCursor: 'next' });
  };
  await s.loadTemplates();
  s.setSearch('第二页');
  assert.equal(requests, 2);
  assert.equal(s.templates.length, 101);
  assert.equal(s.filteredTemplates[0].title, '第二页模板');
});

test('未接入来源阻断，额外声明的时间资料也需要选择范围与命盘', async () => {
  const s = service();
  s.templates[0] = { ...base, bodyJson: importLegacyPrompt('{{meihua.primary}}'), dataRequirements: [] };
  await s.generate();
  assert.equal(s.canCopy, false);
  assert.match(s.diagnostics[0], /完整梅花/);
  s.templates[0] = { ...base, bodyJson: importLegacyPrompt('固定文本'), inputsSchema: [], dataRequirements: ['range.label'] };
  s.chartId = ''; s.start = '2099-12'; s.count = 2;
  assert.equal(s.validateRun(), false);
  assert.ok(s.fieldErrors['prompt-chart']);
  assert.ok(s.fieldErrors['prompt-month']);
});

test('填写项改名保持变量稳定，删除同时处理带空格的引用，可整份撤销', () => {
  const s = service();
  s.change({ bodyJson: importLegacyPrompt('{{ input.action }}\n{{input.action}}') });
  s.updateField(0, { label: '新的中文名称' });
  assert.equal(s.draft.inputsSchema[0].key, 'action');
  s.removeField(0);
  assert.equal(promptDocumentToTemplateText(s.draft.bodyJson).trim(), '');
  s.revert();
  assert.equal(promptDocumentToTemplateText(s.draft.bodyJson), base.body);
});

test('日期校验拒绝溢出日期，月份窗口支持跨年并拒绝上界截短', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(monthRange('2026-11', 3), '2026 年 11 月 — 2027 年 1 月');
  assert.equal(monthRange('2099-12', 2), '');
});

test('剪贴板拒绝后保留可复制全文并请求选中文本，不伪装成已复制', async () => {
  const s = service();
  s.preview = response('完整文本'); s.previewStale = false;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw new Error('denied'); } } } });
  await s.copy();
  assert.equal(s.preview.text, '完整文本');
  assert.equal(s.canCopy, true);
  assert.equal(s.copyFailed, true);
  assert.equal(s.copying, false);
  assert.equal(s.selectTextVersion, 1);
  assert.match(s.notice, /未允许/);
});

test('浏览器一直不回应复制请求时有界返回，不锁住页面', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: () => new Promise(() => {}) } } });
  assert.equal(await writeClipboard('完整文本'), false);
});

test('JSONB键序不同不会产生草稿，变量提取仅来自AST', () => {
  const s = service();
  const json = JSON.parse(JSON.stringify(s.draft.bodyJson));
  const field = s.draft.inputsSchema[0];
  s.change({ bodyJson: { doc: json.doc, schemaVersion: 1 }, inputsSchema: [{ required: field.required, type: field.type, label: field.label, key: field.key }] });
  assert.equal(s.dirty, false);
  s.change({ bodyJson: normalizePromptDocument({ schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '{{range.label}}' }] }] } }) });
  assert.deepEqual(s.editNames, []);
  assert.deepEqual(s.draft.dataRequirements, []);
});

test('正文引用变化保留原有显式附加资料要求', () => {
  const s = service();
  s.change({ dataRequirements: [...s.draft.dataRequirements, 'range.label'] });
  s.change({ bodyJson: importLegacyPrompt('{{ziwei.years}}') });
  assert.deepEqual(s.draft.dataRequirements, ['range.label', 'ziwei.years']);
  s.change({ bodyJson: importLegacyPrompt('{{range.label}}') });
  s.change({ bodyJson: importLegacyPrompt('普通正文') });
  assert.deepEqual(s.draft.dataRequirements, ['range.label']);
});

test('保存、切换模式与模板前同步读取最新编辑器JSON，composition阻断保存', async () => {
  const s = service(); s.setMode('edit');
  let latest = importLegacyPrompt('最新正文'), composing = true, requests = 0;
  s.attachEditor(() => ({ getDocument: () => latest, isComposing: () => composing, rememberSelection() {}, focusSelection() {}, insertVariable() {} }));
  globalThis.fetch = async (_url, init) => { requests++; const sent = JSON.parse(String(init?.body)); assert.equal(Object.hasOwn(sent, 'body'), false); assert.equal(promptDocumentToTemplateText(sent.bodyJson), '最新正文'); return json({ ...base, ...sent, revision: 2 }); };
  await s.save(); assert.equal(requests, 0);
  composing = false; s.setMode('use');
  assert.equal(promptDocumentToTemplateText(s.draft.bodyJson), '最新正文');
  s.setMode('edit'); await s.save(); assert.equal(requests, 1);
  s.setMode('edit'); latest = importLegacyPrompt('切换前草稿'); s.select(s.templates[1]);
  assert.equal(promptDocumentToTemplateText(s.drafts[firstId].bodyJson), '切换前草稿');
});

test('仅显式导入旧语法，错误引用保留并阻断保存', async () => {
  const s = service();
  s.legacyText = '范围{{range.label}}与未闭合{{'; s.importLegacy();
  assert.deepEqual(promptVariableNames(s.draft.bodyJson), ['range.label']);
  let requests = 0; globalThis.fetch = async () => { requests++; return json(base); };
  await s.save(); assert.equal(requests, 0); assert.match(s.editErrors.join(''), /待修复引用/);
});

test('正文打字及新增资料再undo回原AST时保持原要求与干净状态，显式metadata修改不被覆盖', () => {
  const s = service();
  s.templates[0] = { ...base, dataRequirements: ['ziwei.current'] };
  s.select(s.templates[1]); s.select(s.templates[0]);
  const original = JSON.parse(JSON.stringify(s.draft.bodyJson));
  const edited = JSON.parse(JSON.stringify(original));
  edited.doc.content[0].content.push({ type: 'text', text: '新增普通文字' });
  s.change({ bodyJson: edited }); s.change({ bodyJson: original });
  assert.equal(s.dirty, false); assert.deepEqual(s.draft.dataRequirements, ['ziwei.current']);
  s.change({ bodyJson: importLegacyPrompt('{{ziwei.years}}') }); s.change({ bodyJson: original });
  assert.equal(s.dirty, false); assert.deepEqual(s.draft.dataRequirements, ['ziwei.current']);
  s.change({ bodyJson: original, dataRequirements: ['ziwei.decades'] });
  s.change({ bodyJson: importLegacyPrompt('{{ziwei.years}}') }); s.change({ bodyJson: original });
  assert.deepEqual(s.draft.dataRequirements, ['ziwei.decades']);
  assert.equal(s.dirty, true);
});

test('删除仅在附加要求中声明的填写项会清除对应要求，保留其他附加资料', () => {
  const s = service();
  s.change({ bodyJson: importLegacyPrompt('普通正文'), dataRequirements: ['input.action', 'ziwei.current'] });
  s.removeField(0);
  assert.equal(s.draft.inputsSchema.length, 0);
  assert.deepEqual(s.draft.dataRequirements, ['ziwei.current']);
  s.change({ bodyJson: importLegacyPrompt('继续编辑') });
  assert.deepEqual(s.draft.dataRequirements, ['ziwei.current']);
});
