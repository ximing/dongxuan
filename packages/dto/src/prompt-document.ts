import { z } from 'zod';

export const PROMPT_DOCUMENT_VERSION = 1;
export const PROMPT_DOCUMENT_MAX_BYTES = 2 * 1024 * 1024;
export const PROMPT_DOCUMENT_MAX_NODES = 40000;
export const PROMPT_DOCUMENT_MAX_DEPTH = 16;
export const PROMPT_TEMPLATE_MAX_TEXT = 30000;
export const PROMPT_TEMPLATE_REQUEST_BYTES = 3 * 1024 * 1024;
export const PROMPT_PREVIEW_REQUEST_BYTES = 6 * 1024 * 1024;
export const PROMPT_VARIABLE_NAME = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?$/;

export type PromptMark = { type: 'bold' | 'italic' };
type Marked = { marks?: PromptMark[] };
export type PromptText = { type: 'text'; text: string } & Marked;
export type PromptVariableNode = { type: 'promptVariable'; attrs: { name: string } } & Marked;
export type PromptInvalidVariableNode = { type: 'promptInvalidVariable'; attrs: { raw: string; reason: 'unclosed' | 'invalid-name' | 'stray-close' } } & Marked;
export type PromptInline = PromptText | PromptVariableNode | PromptInvalidVariableNode | ({ type: 'hardBreak' } & Marked);
export type PromptParagraph = { type: 'paragraph'; content?: PromptInline[] };
export type PromptHeading = { type: 'heading'; attrs: { level: 1 | 2 | 3 }; content?: PromptInline[] };
export type PromptListItem = { type: 'listItem'; content: [PromptParagraph, ...PromptBlock[]] };
export type PromptList = { type: 'bulletList'; content: PromptListItem[] } | { type: 'orderedList'; attrs?: { start: number }; content: PromptListItem[] };
export type PromptBlock = PromptParagraph | PromptHeading | PromptList;
export type PromptDocument = { schemaVersion: 1; doc: { type: 'doc'; content: PromptBlock[] } };

const inlineTypes = new Set(['text', 'hardBreak', 'promptVariable', 'promptInvalidVariable']);
const blockTypes = new Set(['paragraph', 'heading', 'bulletList', 'orderedList']);
const invalidReasons = new Set(['unclosed', 'invalid-name', 'stray-close']);
type ObjectValue = Record<string, unknown>;
function object(value: unknown): value is ObjectValue { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function fail(message: string): never { throw new Error(message); }
function only(value: ObjectValue, keys: string[]): void {
  if (Object.keys(value).some(key => !keys.includes(key))) fail('正文包含不支持的节点属性。');
}
function marks(value: unknown): PromptMark[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 2) fail('正文只支持粗体和斜体格式。');
  for (const mark of value) {
    if (!object(mark)) fail('正文格式无效。');
    only(mark, ['type']);
    if (mark.type !== 'bold' && mark.type !== 'italic') fail('正文只支持粗体和斜体格式。');
  }
  const types = [...new Set(value.map(mark => (mark as PromptMark).type))].sort();
  return types.length ? types.map(type => ({ type })) : undefined;
}

/** Validate the entire shape iteratively before any recursive clone, schema or serializer. */
function inspectDocument(value: unknown): asserts value is PromptDocument {
  if (!object(value)) fail('模板正文需要 JSON 文档。');
  only(value, ['schemaVersion', 'doc']);
  if (value.schemaVersion !== 1) fail('不支持的模板正文版本，请更新后重试。');
  const pending: Array<{ node: unknown; depth: number; parent: string; index: number }> = [{ node: value.doc, depth: 1, parent: '', index: 0 }];
  const seen = new Set<object>();
  let count = 0, textCharacters = 0;
  while (pending.length) {
    const { node, depth, parent, index } = pending.pop()!;
    if (!object(node)) fail('正文节点结构无效。');
    if (seen.has(node)) fail('正文不能包含循环或重复节点对象。');
    seen.add(node);
    if (++count > PROMPT_DOCUMENT_MAX_NODES) fail('正文节点过多，最多 40,000 个。');
    if (depth > PROMPT_DOCUMENT_MAX_DEPTH) fail('正文嵌套过深，最多 16 层。');
    const type = node.type;
    if (typeof type !== 'string') fail('正文节点缺少类型。');
    const allowed = parent === '' ? type === 'doc'
      : parent === 'doc' ? blockTypes.has(type)
      : parent === 'paragraph' || parent === 'heading' ? inlineTypes.has(type)
      : parent === 'bulletList' || parent === 'orderedList' ? type === 'listItem'
      : parent === 'listItem' ? (index === 0 ? type === 'paragraph' : blockTypes.has(type))
      : false;
    if (!allowed) fail('正文包含不支持的节点或子节点关系。');
    const isInline = inlineTypes.has(type);
    const keys = ['type'];
    if (['doc', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem'].includes(type)) keys.push('content');
    if (['heading', 'orderedList', 'promptVariable', 'promptInvalidVariable'].includes(type)) keys.push('attrs');
    if (type === 'text') keys.push('text');
    if (isInline) keys.push('marks');
    only(node, keys);
    if (isInline) marks(node.marks);
    if (type === 'text') {
      if (typeof node.text !== 'string' || !node.text.length) fail('正文文字节点不能为空。');
      textCharacters += node.text.length;
    } else if (type === 'hardBreak') textCharacters++;
    else if (type === 'promptVariable') {
      if (!object(node.attrs)) fail('资料引用需要稳定名称。');
      only(node.attrs, ['name']);
      if (typeof node.attrs.name !== 'string' || node.attrs.name.length > 64 || !PROMPT_VARIABLE_NAME.test(node.attrs.name)) fail('资料引用名称无效。');
      textCharacters += node.attrs.name.length + 4;
    } else if (type === 'promptInvalidVariable') {
      if (!object(node.attrs)) fail('待修复引用结构无效。');
      only(node.attrs, ['raw', 'reason']);
      if (typeof node.attrs.raw !== 'string' || !node.attrs.raw.length || typeof node.attrs.reason !== 'string' || !invalidReasons.has(node.attrs.reason)) fail('待修复引用结构无效。');
      textCharacters += node.attrs.raw.length;
    } else if (type === 'heading') {
      if (!object(node.attrs)) fail('标题需要有效层级。');
      only(node.attrs, ['level']);
      if (![1, 2, 3].includes(node.attrs.level as number)) fail('标题只支持 1–3 级。');
    } else if (type === 'orderedList' && node.attrs !== undefined) {
      if (!object(node.attrs)) fail('有序列表属性无效。');
      // Tiptap 3 emits a default null HTML list type; normalize that known default away.
      only(node.attrs, ['start', 'type']);
      if (node.attrs.type !== undefined && node.attrs.type !== null) fail('有序列表只支持数字编号。');
      if (node.attrs.start !== undefined && (!Number.isSafeInteger(node.attrs.start) || Number(node.attrs.start) < 1 || Number(node.attrs.start) > 1000000)) fail('有序列表起始编号无效。');
    }
    if (textCharacters > PROMPT_TEMPLATE_MAX_TEXT) fail('模板正文最多 30,000 字符。');
    if (keys.includes('content')) {
      const content = node.content;
      if (content === undefined && (type === 'paragraph' || type === 'heading')) continue;
      if (!Array.isArray(content)) fail('正文节点需要内容数组。');
      if (['doc', 'bulletList', 'orderedList', 'listItem'].includes(type) && !content.length) fail('正文块结构不能为空。');
      if (count + pending.length + content.length > PROMPT_DOCUMENT_MAX_NODES) fail('正文节点过多，最多 40,000 个。');
      for (let child = content.length - 1; child >= 0; child--) pending.push({ node: content[child], depth: depth + 1, parent: type, index: child });
    }
  }
  // Shape, depth, cycles and text have already been bounded.
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > PROMPT_DOCUMENT_MAX_BYTES) fail('正文 JSON 过大，最多 2 MiB。');
}

function cloneInline(node: PromptInline): PromptInline {
  const style = marks(node.marks);
  const withMarks = style ? { marks: style } : {};
  if (node.type === 'text') return { type: 'text', text: node.text, ...withMarks };
  if (node.type === 'promptVariable') return { type: 'promptVariable', attrs: { name: node.attrs.name }, ...withMarks };
  if (node.type === 'promptInvalidVariable') return { type: 'promptInvalidVariable', attrs: { raw: node.attrs.raw, reason: node.attrs.reason }, ...withMarks };
  return { type: 'hardBreak', ...withMarks };
}
function cloneInlines(nodes: PromptInline[] = []): PromptInline[] {
  const out: PromptInline[] = [];
  for (const item of nodes) {
    const node = cloneInline(item), previous = out.at(-1);
    if (node.type === 'text' && previous?.type === 'text' && JSON.stringify(node.marks) === JSON.stringify(previous.marks)) previous.text += node.text;
    else out.push(node);
  }
  return out;
}
function cloneBlock(node: PromptBlock): PromptBlock {
  if (node.type === 'paragraph') {
    const content = cloneInlines(node.content);
    return { type: 'paragraph', ...(content.length ? { content } : {}) };
  }
  if (node.type === 'heading') {
    const content = cloneInlines(node.content);
    return { type: 'heading', attrs: { level: node.attrs.level }, ...(content.length ? { content } : {}) };
  }
  const content: PromptListItem[] = node.content.map(item => ({ type: 'listItem', content: item.content.map(cloneBlock) as [PromptParagraph, ...PromptBlock[]] }));
  return node.type === 'bulletList' ? { type: 'bulletList', content } : { type: 'orderedList', attrs: { start: node.attrs?.start ?? 1 }, content };
}

export function normalizePromptDocument(value: unknown): PromptDocument {
  inspectDocument(value);
  const doc: PromptDocument = { schemaVersion: 1, doc: { type: 'doc', content: value.doc.content.map(cloneBlock) } };
  if (promptDocumentToTemplateText(doc).length > PROMPT_TEMPLATE_MAX_TEXT) fail('模板正文最多 30,000 字符。');
  return doc;
}
export const promptDocumentSchema = z.unknown().transform((value, context): PromptDocument => {
  try { return normalizePromptDocument(value); }
  catch (error) { context.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : '模板正文格式无效。' }); return z.NEVER; }
});
export function emptyPromptDocument(): PromptDocument { return { schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph' }] } }; }

/** The only conversion entry for legacy syntax; ordinary JSON text is never scanned. */
export function importLegacyPrompt(text: string): PromptDocument {
  const source = text.replace(/\r\n/g, '\n');
  if (source.length > PROMPT_TEMPLATE_MAX_TEXT) fail('模板正文最多 30,000 字符。');
  const content: PromptInline[] = [];
  const appendText = (value: string) => {
    const parts = value.split('\n');
    parts.forEach((part, i) => { if (i) content.push({ type: 'hardBreak' }); if (part) content.push({ type: 'text', text: part }); });
  };
  let position = 0;
  while (position < source.length) {
    const open = source.indexOf('{{', position), close = source.indexOf('}}', position);
    if (open === -1 && close === -1) { appendText(source.slice(position)); break; }
    if (close !== -1 && (open === -1 || close < open)) {
      appendText(source.slice(position, close));
      content.push({ type: 'promptInvalidVariable', attrs: { raw: '}}', reason: 'stray-close' } });
      position = close + 2; continue;
    }
    appendText(source.slice(position, open));
    const end = source.indexOf('}}', open + 2), nested = source.indexOf('{{', open + 2);
    if (end === -1 || (nested !== -1 && nested < end)) {
      const stop = nested !== -1 && (end === -1 || nested < end) ? nested : source.length;
      content.push({ type: 'promptInvalidVariable', attrs: { raw: source.slice(open, stop), reason: 'unclosed' } });
      position = stop; continue;
    }
    const raw = source.slice(open, end + 2), name = source.slice(open + 2, end).trim();
    if (name.length <= 64 && PROMPT_VARIABLE_NAME.test(name)) content.push({ type: 'promptVariable', attrs: { name } });
    else content.push({ type: 'promptInvalidVariable', attrs: { raw, reason: 'invalid-name' } });
    position = end + 2;
  }
  return normalizePromptDocument({ schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph', ...(content.length ? { content } : {}) }] } });
}

function walkInlines(document: PromptDocument, visit: (node: PromptInline) => void): void {
  const pending: Array<PromptBlock | PromptListItem> = [...document.doc.content].reverse();
  while (pending.length) {
    const node = pending.pop()!;
    if (node.type === 'paragraph' || node.type === 'heading') (node.content || []).forEach(visit);
    else pending.push(...node.content.slice().reverse());
  }
}
export function promptVariableNames(document: PromptDocument): string[] {
  const names = new Set<string>();
  walkInlines(document, node => { if (node.type === 'promptVariable') names.add(node.attrs.name); });
  return [...names];
}
export function promptDocumentIssues(document: PromptDocument): string[] {
  const issues: string[] = [];
  walkInlines(document, node => { if (node.type === 'promptInvalidVariable') issues.push('存在待修复引用，请在编辑器中重新选择资料、删除或转为普通文字。'); });
  return [...new Set(issues)];
}

function renderInlines(nodes: PromptInline[] | undefined, variable: (name: string) => string, invalid: (node: PromptInvalidVariableNode) => string): string {
  return (nodes || []).map(node => node.type === 'text' ? node.text : node.type === 'hardBreak' ? '\n' : node.type === 'promptVariable' ? variable(node.attrs.name) : invalid(node)).join('');
}
function renderBlocks(nodes: PromptBlock[], variable: (name: string) => string, invalid: (node: PromptInvalidVariableNode) => string, depth = 0): string {
  return nodes.map(node => {
    if (node.type === 'paragraph' || node.type === 'heading') return renderInlines(node.content, variable, invalid);
    return node.content.map((item, index) => {
      const prefix = node.type === 'bulletList' ? '- ' : String((node.attrs?.start || 1) + index) + '. ';
      const paragraph = renderInlines(item.content[0].content, variable, invalid);
      const lead = '  '.repeat(depth);
      const first = paragraph.split('\n').map((line, n) => lead + (n ? ' '.repeat(prefix.length) : prefix) + line).join('\n');
      const rest = item.content.slice(1).map(block => {
        const text = renderBlocks([block], variable, invalid, depth + 1);
        return '\n' + (block.type === 'paragraph' || block.type === 'heading' ? text.split('\n').map(line => '  '.repeat(depth + 1) + line).join('\n') : text);
      }).join('');
      return first + rest;
    }).join('\n');
  }).join('\n\n');
}
/** Read-only, potentially lossy legacy projection. Never use it to discover variables. */
export function promptDocumentToTemplateText(document: PromptDocument): string {
  return renderBlocks(document.doc.content, name => '{{' + name + '}}', node => node.attrs.raw);
}
export function renderPromptDocument(document: PromptDocument, values: Record<string, string>, maximumLength = Infinity): string {
  let resolvedLength = 0;
  const text = renderBlocks(document.doc.content, name => {
    if (!Object.hasOwn(values, name)) fail('引用内容缺失：' + name);
    resolvedLength += values[name].length;
    if (resolvedLength > maximumLength) fail('展开结果超过 200,000 字符，请缩短范围');
    return values[name];
  }, () => fail('存在待修复引用，无法生成提示词。'));
  if (text.length > maximumLength) fail('展开结果超过 200,000 字符，请缩短范围');
  return text;
}

export function removePromptVariable(document: PromptDocument, name: string): PromptDocument {
  const mapBlock = (node: PromptBlock): PromptBlock => {
    if (node.type === 'paragraph' || node.type === 'heading') return { ...node, content: (node.content || []).filter(item => item.type !== 'promptVariable' || item.attrs.name !== name) };
    return { ...node, content: node.content.map(item => ({ type: 'listItem', content: item.content.map(mapBlock) as [PromptParagraph, ...PromptBlock[]] })) };
  };
  return normalizePromptDocument({ schemaVersion: 1, doc: { type: 'doc', content: document.doc.content.map(mapBlock) } });
}
/** Immutable canonical documents compare independently of JSONB object key ordering. */
export function promptDocumentsEqual(left: PromptDocument, right: PromptDocument): boolean {
  const pending: Array<[unknown, unknown]> = [[left, right]];
  while (pending.length) {
    const [a, b] = pending.pop()!;
    if (a === b) continue;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    if (ka.length !== kb.length || ka.some((key, i) => key !== kb[i])) return false;
    for (const key of ka) pending.push([(a as ObjectValue)[key], (b as ObjectValue)[key]]);
  }
  return true;
}
