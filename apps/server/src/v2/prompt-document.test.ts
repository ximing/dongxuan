import { describe, expect, it } from 'vitest';
import {
  emptyPromptDocument, importLegacyPrompt, normalizePromptDocument, promptDocumentIssues,
  promptDocumentsEqual, promptDocumentSchema, promptDocumentToTemplateText, promptTemplateInputSchema,
  promptVariableNames, removePromptVariable, renderPromptDocument, PROMPT_DOCUMENT_MAX_BYTES,
} from '@dongxuan/dto';
import { templateChecks } from './prompt-engine.js';
import { PROMPT_SEEDS } from './prompt-seeds.js';

const literal = (text: string) => ({ schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } });
const template = (bodyJson: unknown) => promptTemplateInputSchema.parse({ title: '测试模板', system: 'ziwei', bodyJson });

describe('prompt JSON document', () => {
  it('keeps ordinary braces literal and substitutes only the variable atom, once', () => {
    const doc = normalizePromptDocument({ schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: '{{range.label}} / ' },
      { type: 'promptVariable', attrs: { name: 'input.action' } },
    ] }] } });
    expect(promptVariableNames(doc)).toEqual(['input.action']);
    expect(renderPromptDocument(doc, { 'input.action': '<b>{{range.label}}</b>' })).toBe('{{range.label}} / <b>{{range.label}}</b>');
    expect(templateChecks(template(literal('{{range.label}}'))).issues).toEqual([]);
    expect(templateChecks(template(literal('{{range.label}}'))).names).toEqual([]);
  });
  it('imports legacy text without reflowing literal markdown, blank lines, final LF or Unicode', () => {
    const source = '# 标题\r\n\r\n **引号 " 与反斜杠 \\ 😀**\r\n{{ input.action }}\r\n\r\n';
    const doc = importLegacyPrompt(source);
    expect(doc.doc.content).toHaveLength(1);
    expect(promptVariableNames(doc)).toEqual(['input.action']);
    expect(renderPromptDocument(doc, { 'input.action': '值 {{range.label}}' })).toBe('# 标题\n\n **引号 " 与反斜杠 \\ 😀**\n值 {{range.label}}\n\n');
    expect(promptDocumentToTemplateText(doc)).toBe(source.replace(/\r\n/g, '\n').replace('{{ input.action }}', '{{input.action}}'));
    expect(renderPromptDocument(importLegacyPrompt('纯文本\n\n\n'), {})).toBe('纯文本\n\n\n');
  });
  it('retains malformed legacy references as repairable nodes, unlike the same literal new text', () => {
    for (const source of ['旧引用 {{input.action', '旧引用 }}', '{{ invalid name }}', '{{a{{question}}']) {
      const doc = importLegacyPrompt(source);
      expect(promptDocumentIssues(doc)).not.toEqual([]);
      expect(promptDocumentToTemplateText(doc)).toBe(source);
      expect(() => renderPromptDocument(doc, { question: '值' })).toThrow('待修复引用');
      expect(promptDocumentIssues(normalizePromptDocument(literal(source)))).toEqual([]);
      expect(renderPromptDocument(normalizePromptDocument(literal(source)), {})).toBe(source);
    }
  });
  it('keeps valid unknown references visible for semantic validation, not blank conversion', () => {
    const input = promptTemplateInputSchema.parse({ title: '未知', system: 'ziwei', body: '{{unknown}}' });
    expect(promptVariableNames(input.bodyJson)).toEqual(['unknown']);
    expect(templateChecks(input).issues[0]).toContain('unknown');
    expect(templateChecks(template(emptyPromptDocument())).issues).toContain('请填写模板正文。');
  });
  it('rejects both bodies even if their read-only text projection is identical', () => {
    const bodyJson = importLegacyPrompt('{{range.label}}');
    expect(promptTemplateInputSchema.safeParse({ title: '测试', system: 'ziwei', bodyJson, body: '{{range.label}}' }).success).toBe(false);
    expect(promptTemplateInputSchema.safeParse({ title: '测试', system: 'ziwei' }).success).toBe(false);
    const parsed = template(bodyJson);
    expect(Object.hasOwn(parsed, 'body')).toBe(false);
    expect(promptVariableNames(parsed.bodyJson)).toEqual(['range.label']);
  });
  it('rejects unsupported nodes, attrs, marks and structural placements before serialization', () => {
    const invalid = [
      { ...literal('x'), schemaVersion: 2 },
      { ...literal('x'), label: 'spoof' },
      { schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'script', content: [] }] } },
      { schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'text', text: '顶层' }] } },
      { schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'promptVariable', attrs: { name: 'range.label', label: '伪造名称' } }] }] } },
      { schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:bad' } }] }] }] } },
      { schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'listItem', content: [] }] } },
    ];
    for (const doc of invalid) expect(promptDocumentSchema.safeParse(doc).success).toBe(false);
  });
  it('normalizes Tiptap default ordered-list type and renders nested lists/continuations deterministically', () => {
    const doc = normalizePromptDocument({ schemaVersion: 1, doc: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '安排', marks: [{ type: 'bold' }] }] },
      { type: 'orderedList', attrs: { start: 3, type: null }, content: [{ type: 'listItem', content: [
        { type: 'paragraph', content: [{ type: 'text', text: '主项' }, { type: 'hardBreak' }, { type: 'text', text: '续行' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '子项' }] }] }] },
      ] }] },
    ] } });
    expect(renderPromptDocument(doc, {})).toBe('安排\n\n3. 主项\n   续行\n  - 子项');
    expect((doc.doc.content[1] as { attrs: unknown }).attrs).toEqual({ start: 3 });
    expect(promptDocumentSchema.safeParse({ schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'orderedList', attrs: { start: 1, type: 'a' }, content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }] } }).success).toBe(false);
  });
  it('ignores JSONB key order while retaining text, node order and hard breaks in equality', () => {
    const doc = importLegacyPrompt('A {{range.label}}\nB');
    const reordered = JSON.parse(JSON.stringify(doc, Object.keys({ schemaVersion: 0, doc: 0, type: 0, content: 0, attrs: 0, name: 0, text: 0, marks: 0 }).reverse()));
    expect(promptDocumentsEqual(doc, reordered)).toBe(true);
    expect(promptDocumentsEqual(doc, importLegacyPrompt('A {{range.label}}\nC'))).toBe(false);
  });
  it('removes only actual matching nodes, preserving identical literal text and other references', () => {
    const doc = normalizePromptDocument({ schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: '{{input.action}}' },
      { type: 'promptVariable', attrs: { name: 'input.action' } },
      { type: 'promptVariable', attrs: { name: 'profile.name' } },
    ] }] } });
    const next = removePromptVariable(doc, 'input.action');
    expect(promptVariableNames(next)).toEqual(['profile.name']);
    expect(renderPromptDocument(next, { 'profile.name': '甲' })).toBe('{{input.action}}甲');
  });
  it('enforces byte, text, count and depth limits with bounded handling of cycles', () => {
    const large = (count: number, both = false) => ({ schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: Array.from({ length: count }, (_, i) => ({ type: 'text', text: 'x', marks: both ? [{ type: 'bold' }, { type: 'italic' }] : [{ type: i % 2 ? 'bold' : 'italic' }] })) }] } });
    const valid = large(22000), oversized = large(30000, true);
    expect(Buffer.byteLength(JSON.stringify(valid))).toBeGreaterThan(1024 * 1024);
    expect(promptDocumentSchema.safeParse(valid).success).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(oversized))).toBeGreaterThan(PROMPT_DOCUMENT_MAX_BYTES);
    expect(() => normalizePromptDocument(oversized)).toThrow('2 MiB');
    expect(() => normalizePromptDocument(literal('x'.repeat(30001)))).toThrow('30,000');
    const cycle: any = { type: 'bulletList', content: [] };
    cycle.content = [{ type: 'listItem', content: [{ type: 'paragraph' }, cycle] }];
    expect(() => normalizePromptDocument({ schemaVersion: 1, doc: { type: 'doc', content: [cycle] } })).toThrow();
    expect(promptDocumentSchema.safeParse({ schemaVersion: 1, doc: { type: 'doc', content: Array.from({ length: 40000 }, () => ({ type: 'paragraph' })) } }).success).toBe(false);
    // The longest legacy newline-only document remains representable.
    expect(promptDocumentToTemplateText(importLegacyPrompt('\n'.repeat(30000))).length).toBe(30000);
  });
  it('produces the same filled text as all four original complete seed frameworks', () => {
    for (const seed of PROMPT_SEEDS) {
      const text = promptDocumentToTemplateText(seed.bodyJson);
      const values = Object.fromEntries(promptVariableNames(seed.bodyJson).map(name => [name, '值[' + name + '] {{input.action}}']));
      expect(renderPromptDocument(seed.bodyJson, values)).toBe(text.replace(/\{\{([^{}]*)\}\}/g, (_, name: string) => values[name.trim()]));
    }
  });
  it('bounds expansion before allocating repeated large variable values', () => {
    const doc = importLegacyPrompt('{{input.action}}'.repeat(100));
    expect(() => renderPromptDocument(doc, { 'input.action': '值'.repeat(30000) }, 200000)).toThrow('200,000');
  });
});
