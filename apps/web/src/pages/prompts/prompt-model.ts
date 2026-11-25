import { normalizePromptDocument, promptDocumentsEqual, promptDocumentIssues, promptDocumentToTemplateText, promptVariableNames, type PromptDocument, type PromptTemplateInput, type PromptVariable } from '@dongxuan/dto';

export function copyTemplate(template: PromptTemplateInput): PromptTemplateInput {
  return { title: template.title, system: template.system, bodyJson: normalizePromptDocument(template.bodyJson),
    inputsSchema: template.inputsSchema.map(field => ({ key: field.key, label: field.label, type: field.type, required: field.required, ...(field.missingPolicy ? { missingPolicy: field.missingPolicy } : {}) })),
    dataRequirements: [...template.dataRequirements],
    ...(template.missingPolicy ? { missingPolicy: template.missingPolicy } : {}) };
}

export function readNames(document: PromptDocument): string[] { return promptVariableNames(document); }
export function templateNames(template: PromptTemplateInput): string[] {
  return [...new Set([...readNames(template.bodyJson), ...template.dataRequirements])];
}
export function templatesEqual(left: PromptTemplateInput, right: PromptTemplateInput): boolean {
  const { bodyJson: leftBody, ...leftMetadata } = copyTemplate(left);
  const { bodyJson: rightBody, ...rightMetadata } = copyTemplate(right);
  return promptDocumentsEqual(leftBody, rightBody) && JSON.stringify(leftMetadata) === JSON.stringify(rightMetadata);
}
/** Keep explicit requirements that were not supplied by the previous document. */
export function bodyRequirements(template: PromptTemplateInput, next: PromptDocument, explicit: string[] = [], baseline?: { names: string[]; requirements: string[] }): string[] {
  const nextNames = readNames(next);
  const baselineNames = new Set(baseline?.names);
  if (baseline && nextNames.length === baselineNames.size && nextNames.every(name => baselineNames.has(name))) {
    return [...new Set([...baseline.requirements, ...explicit])];
  }
  const previous = new Set(readNames(template.bodyJson));
  const extras = template.dataRequirements.filter(name => !previous.has(name));
  const names = [...new Set([...explicit, ...extras, ...nextNames.filter(name => !name.startsWith('input.') && name !== 'question')])];
  // Requirements are a set; retain persisted ordering when only reference order changes.
  const oldNames = new Set(template.dataRequirements);
  return names.length === oldNames.size && names.every(name => oldNames.has(name)) ? [...template.dataRequirements] : names;
}
export function describeTemplate(template: PromptTemplateInput): string {
  const names = templateNames(template);
  if (names.some(name => name.startsWith('meihua.') && name !== 'meihua.time')) return '需要完整卦象资料，当前尚未接入。';
  if (template.system === 'meihua' && names.includes('meihua.time')) return '带上问题、数字和起卦时辰，先确认起卦规则。';
  if (template.system === 'meihua') return '带上问题和数字，先确认起卦规则。';
  if (names.includes('ziwei.months')) return '选一段时间，安排一件具体的事。';
  if (names.includes('ziwei.years')) return '先看长期趋势，再比较现实中的选择。';
  if (names.includes('ziwei.natal')) return '结合本命资料，梳理这次关心的问题。';
  return '沿用这份分析框架，补充本次资料。';
}
export function validateTemplate(template: PromptTemplateInput, catalog: PromptVariable[]): string[] {
  const errors: string[] = [];
  if (!template.title.trim() || template.title.length > 80) errors.push('模板名称需要填写，最多 80 字。');
  if (!promptDocumentToTemplateText(template.bodyJson).trim()) errors.push('模板正文需要填写，最多 30,000 字符。');
  if (template.inputsSchema.length > 16) errors.push('本次填写项最多 16 项。');
  const keys = template.inputsSchema.map(field => field.key);
  if (new Set(keys).size !== keys.length) errors.push('填写项的变量名不能重复。');
  for (const field of template.inputsSchema) {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(field.key) || !field.label.trim() || field.label.length > 80) errors.push('填写项需要有效的名称与变量名，名称最多 80 字。');
  }
  errors.push(...promptDocumentIssues(template.bodyJson).map(() => '正文包含待修复引用，请重新选择资料、删除或转为普通文字。'));
  if (catalog.length) {
    const allowed = new Set([...catalog.map(variable => variable.name), ...keys.map(key => 'input.' + key)]);
    for (const name of templateNames(template)) if (!allowed.has(name)) errors.push('存在未识别的资料引用，请重新选择资料或添加对应填写项（' + name + '）。');
  }
  return [...new Set(errors)];
}
export function parseYears(value: string): number[] {
  return [...new Set(value.split(/[，,、\s]+/).filter(Boolean).map(Number))];
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1901-01-01' || value > '2099-12-31') return false;
  const date = new Date(value + 'T12:00:00');
  return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8, 10));
}
export function monthRange(start: string, count: number): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(start) || start < '1901-01' || start > '2099-12' || !Number.isInteger(count) || count < 1 || count > 12) return '';
  const [year, month] = start.split('-').map(Number), end = new Date(year, month + count - 1, 0);
  if (end.getFullYear() > 2099) return '';
  return year + ' 年 ' + month + ' 月 — ' + end.getFullYear() + ' 年 ' + (end.getMonth() + 1) + ' 月';
}
/** Clipboard permission can require another user gesture after an async preview. */
export async function writeClipboard(text: string): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (navigator.clipboard?.writeText) {
      return await Promise.race([
        navigator.clipboard.writeText(text).then(() => true),
        new Promise<boolean>(resolve => { timeout = setTimeout(() => resolve(false), 1800); }),
      ]);
    }
    const field = document.createElement('textarea'), focused = document.activeElement;
    field.value = text; field.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.append(field);
    try { field.select(); return document.execCommand('copy'); }
    finally { field.remove(); if (focused instanceof HTMLElement) focused.focus(); }
  } catch { return false; }
  finally { clearTimeout(timeout); }
}
