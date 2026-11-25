import { createHash } from 'node:crypto';
import { promptDocumentIssues, promptDocumentToTemplateText, promptVariableNames, type PromptTemplateInput, type PromptVariable, type PromptField } from '@dongxuan/dto';
const meihuaLabels = { upper: '上卦', lower: '下卦', method: '起卦方法', time: '起卦时间', primary: '本卦', mutual: '互卦', changed: '变卦', moving_line: '动爻', body_use: '体用' };
const definitions = [['chart.title', '盘面名称', 'chart'], ['question', '本次问题', 'input'], ['profile.name', '命盘称呼', 'profile'], ['profile.gender', '命盘上的性别', 'profile'], ['bazi.chart', '完整八字命盘', 'bazi'], ['ziwei.birth', '出生资料', 'ziwei'], ['ziwei.natal', '本命文字盘', 'ziwei'], ['ziwei.current', '指定日完整运限', 'ziwei'], ['ziwei.gender_age', '性别与基准日虚岁', 'ziwei'], ['ziwei.decade_current', '当前大限', 'ziwei'], ['ziwei.decades', '当前与下一大限', 'ziwei'], ['ziwei.years', '多个流年', 'ziwei'], ['years.label', '目标流年列表', 'ziwei'], ['range.label', '阳历月份范围', 'ziwei'], ['ziwei.months', '连续流月资料', 'ziwei'], ...Object.entries(meihuaLabels).map(([key, label]) => ['meihua.' + key, label, 'meihua'])];
export const VARIABLES: PromptVariable[] = definitions.map(([name, label, source]) => ({ name, label, source, status: source === 'bazi' || (source === 'meihua' && name !== 'meihua.time') ? 'planned' : 'available' }));
export function templateChecks(t: PromptTemplateInput): {
    names: string[];
    issues: string[];
} { const names = promptVariableNames(t.bodyJson), allowed = new Set([...VARIABLES.map(v => v.name), ...t.inputsSchema.map(f => 'input.' + f.key)]), issues = promptDocumentIssues(t.bodyJson);
  if (!promptDocumentToTemplateText(t.bodyJson).trim()) issues.push('请填写模板正文。');
  for (const n of new Set([...names, ...t.dataRequirements]))
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
