import { createHash } from 'node:crypto';
import type { PromptTemplateInput, PromptVariable, PromptField } from '@dongxuan/dto';
const definitions = [['chart.title', '盘面名称', 'chart'], ['question', '本次问题', 'input'], ['profile.name', '命盘称呼', 'profile'], ['profile.gender', '命盘上的性别', 'profile'], ['bazi.chart', '八字命盘（待接入）', 'bazi'], ['ziwei.birth', '出生资料', 'ziwei'], ['ziwei.natal', '本命文字盘', 'ziwei'], ['ziwei.current', '指定日完整运限', 'ziwei'], ['ziwei.gender_age', '性别与基准日虚岁', 'ziwei'], ['ziwei.decade_current', '当前大限', 'ziwei'], ['ziwei.decades', '当前与下一大限', 'ziwei'], ['ziwei.years', '多个流年', 'ziwei'], ['years.label', '目标流年列表', 'ziwei'], ['range.label', '阳历月份范围', 'ziwei'], ['ziwei.months', '连续流月资料', 'ziwei'], ...['upper', 'lower', 'method', 'time', 'primary', 'mutual', 'changed', 'moving_line', 'body_use'].map(k => ['meihua.' + k, '梅花 ' + k + '（待接入）', 'meihua'])];
export const VARIABLES: PromptVariable[] = definitions.map(([name, label, source]) => ({ name, label, source, status: source === 'bazi' || source === 'meihua' ? 'planned' : 'available' }));
export function templateChecks(t: PromptTemplateInput): {
    names: string[];
    issues: string[];
} { const names = [...new Set([...t.body.matchAll(/\{\{([^{}]*)\}\}/g)].map(m => m[1].trim()))], allowed = new Set([...VARIABLES.map(v => v.name), ...t.inputsSchema.map(f => 'input.' + f.key)]), issues: string[] = []; if (/\{\{|\}\}/.test(t.body.replace(/\{\{[^{}]*\}\}/g, '')))
    issues.push('占位符括号不完整，请使用 {{变量名}}'); for (const n of new Set([...names, ...t.dataRequirements]))
    if (!allowed.has(n))
        issues.push('不支持或未声明的变量：' + n); return { names, issues }; }
export function runtimeValues(fields: PromptField[], names: string[], input: Record<string, string | number>, question?: string) { const values: Record<string, string> = Object.create(null), issues: string[] = []; for (const f of fields) {
    if (!names.includes('input.' + f.key))
        continue;
    const raw = Object.hasOwn(input, f.key) ? String(input[f.key]).trim() : '';
    if (!raw && f.required)
        issues.push('本次填写缺失：' + f.label);
    if (raw && f.type === 'integer' && !Number.isSafeInteger(Number(raw)))
        issues.push('本次填写无效：' + f.label + '必须是安全范围内的整数');
    if (raw.length > 30000)
        issues.push('填写内容过长：' + f.label);
    values['input.' + f.key] = raw || '未提供（按模板的信息不足规则处理，不能自行补全）';
} if (names.includes('question')) {
    values.question = question?.trim() || '';
    if (!values.question)
        issues.push('本次填写缺失：本次问题');
} return { values, issues }; }
export function replaceOnce(body: string, values: Record<string, string>): string { return body.replace(/\{\{([^{}]*)\}\}/g, (_, name) => values[name.trim()]); }
export const fingerprint = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
