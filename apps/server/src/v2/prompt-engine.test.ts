import { describe, it, expect } from 'vitest';
import { promptTemplateInputSchema } from '@dongxuan/dto';
import { runtimeValues, replaceOnce, templateChecks } from './prompt-engine.js';
const template = (body: string) => promptTemplateInputSchema.parse({ title: '测试', system: 'ziwei', body, inputsSchema: [{ key: 'action', label: '动作', type: 'textarea', required: true }, { key: 'option', label: '选项', type: 'text', required: false }] });
describe('prompt text engine', () => {
    it('rejects unknown tokens, malformed syntax and undeclared fields', () => { expect(templateChecks(template('{{unknown}} {{input.other}} {{ziwei.natal}')).issues).toHaveLength(3); });
    it('replaces once and treats HTML as text', () => { expect(replaceOnce('A {{input.action}}', { 'input.action': '<b>{{ziwei.natal}}</b>' })).toBe('A <b>{{ziwei.natal}}</b>'); });
    it('distinguishes required action from optional missing real-world options', () => { const t = template('{{input.action}} {{input.option}}'), r = runtimeValues(t.inputsSchema, ['input.action', 'input.option'], {}); expect(r.issues).toEqual(['本次填写缺失：动作']); expect(r.values['input.option']).toContain('未提供'); });
    it('does not read inherited values and validates safe integers', () => { const r = runtimeValues([{ key: 'constructor', label: '数字', type: 'integer', required: true }], ['input.constructor'], {}); expect(r.issues).toHaveLength(1); expect(runtimeValues([{ key: 'n', label: '数字', type: 'integer', required: true }], ['input.n'], { n: '1.2' }).issues).toHaveLength(1); });
    it('allows declared mixed sources without substituting other systems', () => expect(templateChecks(template('{{profile.name}} {{bazi.chart}} {{ziwei.natal}}')).issues).toEqual([]));
});
