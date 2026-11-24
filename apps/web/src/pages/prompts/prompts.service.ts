import { Service } from '@rabjs/react';
import type { ChartRecordSummary, ChartSnapshot, MeihuaDraft, PromptField, PromptPreview, PromptTemplate, PromptTemplateInput, PromptVariable } from '@dongxuan/dto';
import { listAllCharts } from '@/api/charts';
import { createPromptPreview, deletePromptTemplate, getMeihuaDraft, getPromptSnapshot, listPromptVariables, savePromptTemplate } from '@/api/prompts';
import { errorMessage, monthNow, today } from '@/lib/format';
import { PagedList } from '@/lib/paged-list';
import { DialogService } from '@/services/dialog.service';

function blank(): PromptTemplateInput {
  return { title: '新模板', system: 'ziwei', body: '', inputsSchema: [], dataRequirements: [] };
}

function copyTemplate(template: PromptTemplateInput): PromptTemplateInput {
  return {
    title: template.title,
    system: template.system,
    body: template.body,
    inputsSchema: template.inputsSchema.map((field) => ({ ...field })),
    dataRequirements: [...template.dataRequirements],
    ...(template.missingPolicy ? { missingPolicy: template.missingPolicy } : {}),
  };
}

function readNames(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{([^{}]*)\}\}/g)].map((match) => match[1].trim()))];
}

export class PromptsService extends Service {
  templates = new PagedList<PromptTemplate>();
  draft: PromptTemplateInput = blank();
  active: string | null = null;
  catalog: PromptVariable[] = [];
  charts: ChartRecordSummary[] = [];
  chartId = '';
  snapshotId = '';
  sourceSnapshot: ChartSnapshot | null = null;
  sourceLoading = false;
  sourceNotice = '';
  meihua: MeihuaDraft | null = null;
  asOf = today();
  start = monthNow();
  count = 3;
  years = String(new Date().getFullYear());
  values: Record<string, string> = {};
  question = '';
  preview: PromptPreview | null = null;
  error = '';
  notice = '';
  pending = false;
  catalogLoaded = false;
  _requestVersion = 0;
  _sourceVersion = 0;
  _inFlight = false;
  _initialSelected = false;
  _contextId = '';

  constructor() {
    super();
    const params = new URLSearchParams(window.location.search);
    this.chartId = params.get('chart') || '';
    this.snapshotId = params.get('snapshot') || '';
    this.sourceLoading = Boolean(params.get('snapshot'));
    this.asOf = params.get('date') || today();
    this.start = params.get('start') || monthNow();
    this.count = Number(params.get('count')) || 3;
  }

  get dialog(): DialogService {
    return this.resolve(DialogService);
  }

  get original(): PromptTemplate | undefined {
    return this.templates.items.find((template) => template.id === this.active);
  }

  get names(): string[] {
    return readNames(this.draft.body);
  }

  get dirty(): boolean {
    const original = this.original;
    return !original || JSON.stringify(copyTemplate(original)) !== JSON.stringify(this.draft);
  }

  uses(name: string): boolean {
    return this.names.includes(name);
  }

  get needZiwei(): boolean {
    return this.names.some((name) => name.startsWith('ziwei.')) || (this.draft.system === 'ziwei' && this.uses('chart.title'));
  }

  get needProfile(): boolean {
    return this.names.some((name) => name.startsWith('profile.'));
  }

  get needMeihua(): boolean {
    return this.names.some((name) => name.startsWith('meihua.')) || (this.draft.system === 'meihua' && this.uses('chart.title'));
  }

  get usesMonths(): boolean {
    return this.uses('ziwei.months') || this.uses('range.label');
  }

  get usesYears(): boolean {
    return this.uses('ziwei.years') || this.uses('years.label');
  }

  get usesDate(): boolean {
    return this.names.some((name) => ['ziwei.gender_age', 'ziwei.current', 'ziwei.decade_current', 'ziwei.decades'].includes(name));
  }

  get sourceLabel(): string {
    const sourceQuery = this.sourceSnapshot?.query;
    if (!sourceQuery) return '本命基础快照';
    if (sourceQuery.mode === 'day') return `${sourceQuery.date} · ${sourceQuery.includeDaily ? '含流日' : '不含流日'}`;
    if (sourceQuery.mode === 'months') return `${sourceQuery.startMonth} 起连续 ${sourceQuery.count} 个月`;
    if (sourceQuery.mode === 'years') return `${sourceQuery.years.join('、')} 流年`;
    return `${sourceQuery.asOfDate} 当前 / 下一大限`;
  }

  async boot(): Promise<void> {
    try {
      const [catalog, charts] = await Promise.all([
        listPromptVariables(),
        listAllCharts(),
      ]);
      this.catalog = catalog;
      this.charts = charts;
      this.catalogLoaded = true;
    } catch (error) {
      this.error = errorMessage(error);
    }
  }

  selectInitial(system: string | null): void {
    if (this._initialSelected || !this.catalogLoaded || !this.templates.loaded) return;
    const templates = this.templates.items;
    const preferred = system === 'meihua'
      ? templates.find((template) => template.system === 'meihua' && template.title.includes('完整'))
      : templates[0];
    const template = preferred || templates[0];
    if (template) {
      this.active = template.id;
      this.draft = copyTemplate(template);
    }
    this._initialSelected = true;
  }

  async loadDraft(id: string): Promise<void> {
    if (!id || this._contextId === id) return;
    try {
      const draft = await getMeihuaDraft(id);
      this.meihua = draft;
      if (!this.chartId && draft.chartId) this.chartId = draft.chartId;
      this.values = { question: draft.question, number_a: String(draft.numberA), number_b: String(draft.numberB) };
      this.question = draft.question;
      this._contextId = id;
    } catch (error) {
      this.error = errorMessage(error);
    }
  }

  async loadSnapshot(sourceId: string, chartFromUrl: string | null): Promise<void> {
    const fetchVersion = ++this._sourceVersion;
    this.sourceLoading = true;
    try {
      const source = await getPromptSnapshot(sourceId);
      if (fetchVersion !== this._sourceVersion) return;
      if (chartFromUrl && source.chartId !== chartFromUrl) throw new Error('保存视图不属于当前命盘，请核对来源。');
      this.sourceSnapshot = source;
      this.snapshotId = source.id;
      this.chartId = source.chartId;
      if (source.query?.mode === 'day') this.asOf = source.query.date;
      if (source.query?.mode === 'months') {
        this.start = source.query.startMonth;
        this.count = source.query.count;
      }
      if (source.query?.mode === 'years') this.years = source.query.years.join(', ');
      if (source.query?.mode === 'decades') this.asOf = source.query.asOfDate;
      this._requestVersion += 1;
      this.preview = null;
      this.sourceNotice = '';
    } catch (error) {
      if (fetchVersion === this._sourceVersion) this.error = errorMessage(error);
    } finally {
      if (fetchVersion === this._sourceVersion) this.sourceLoading = false;
    }
  }

  cancelSnapshot(): void {
    this._sourceVersion += 1;
  }

  invalidate(): void {
    this._requestVersion += 1;
    this.preview = null;
    this.notice = '';
  }

  clearSnapshotBinding(): void {
    this._sourceVersion += 1;
    this.snapshotId = '';
    this.sourceSnapshot = null;
    this.sourceLoading = false;
    this.sourceNotice = '已改用基础盘取数，将按当前时间条件重新计算。';
  }

  change(patch: Partial<PromptTemplateInput>): void {
    this.draft = { ...this.draft, ...patch };
    this.invalidate();
  }

  guard(): boolean {
    if (this.dirty) {
      this.error = '有未保存的修改，请先保存模板或撤销修改。';
      return false;
    }
    this.error = '';
    return true;
  }

  select(template: PromptTemplate): void {
    this._requestVersion += 1;
    this.active = template.id;
    this.draft = copyTemplate(template);
    if (template.system === 'meihua' && this.meihua) {
      this.values = { question: this.meihua.question, number_a: String(this.meihua.numberA), number_b: String(this.meihua.numberB) };
      this.question = this.meihua.question;
    } else {
      this.values = {};
      this.question = '';
    }
    this.preview = null;
    this.notice = '';
    this.error = '';
  }

  startBlank(): void {
    if (!this.guard()) return;
    this.active = null;
    this.draft = blank();
    this.values = {};
    this.preview = null;
  }

  saveCopy(): void {
    this.active = null;
    this.change({ title: this.draft.title.slice(0, 74) + ' · 副本' });
    this.notice = '保存后将创建独立模板。';
  }

  revert(): void {
    const original = this.original;
    if (original) this.select(original);
    else if (this.templates.items[0]) this.select(this.templates.items[0]);
    else this.draft = blank();
  }

  setSystem(system: PromptTemplateInput['system']): void {
    this.change({ system });
    this.values = {};
    this.question = '';
  }

  selectChart(value: string): void {
    this.chartId = value;
    this.clearSnapshotBinding();
    this.values = {};
    this.question = '';
    this.invalidate();
  }

  setAsOf(value: string): void {
    this.asOf = value;
    if (this.snapshotId) this.clearSnapshotBinding();
    this.invalidate();
  }

  setStart(value: string): void {
    this.start = value;
    if (this.snapshotId) this.clearSnapshotBinding();
    this.invalidate();
  }

  setCount(value: number): void {
    this.count = value;
    if (this.snapshotId) this.clearSnapshotBinding();
    this.invalidate();
  }

  setYears(value: string): void {
    this.years = value;
    if (this.snapshotId) this.clearSnapshotBinding();
    this.invalidate();
  }

  setQuestion(value: string): void {
    this.question = value;
    this.invalidate();
  }

  setInputValue(key: string, value: string): void {
    this.values = { ...this.values, [key]: value };
    this.invalidate();
  }

  addField(): void {
    const keys = new Set(this.draft.inputsSchema.map((field) => field.key));
    let index = 1;
    while (keys.has(`field_${index}`)) index += 1;
    this.change({
      inputsSchema: [...this.draft.inputsSchema, { key: `field_${index}`, label: '新填写项', type: 'text', required: true, missingPolicy: 'block' }],
    });
  }

  updateField(index: number, patch: Partial<PromptField>): void {
    const old = this.draft.inputsSchema[index]?.key;
    this.change({
      inputsSchema: this.draft.inputsSchema.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field),
    });
    if (patch.key && patch.key !== old && old) {
      const next = { ...this.values };
      delete next[old];
      this.values = next;
    }
  }

  removeField(index: number): void {
    const field = this.draft.inputsSchema[index];
    this.change({ inputsSchema: this.draft.inputsSchema.filter((_, fieldIndex) => fieldIndex !== index) });
    if (!field) return;
    const next = { ...this.values };
    delete next[field.key];
    this.values = next;
  }

  insert(element: HTMLTextAreaElement | null, name: string): void {
    if (!element) return;
    const text = `{{${name}}}`;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    this.change({ body: this.draft.body.slice(0, start) + text + this.draft.body.slice(end) });
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + text.length, start + text.length);
    });
  }

  async save(): Promise<void> {
    this.error = '';
    this.pending = true;
    const data = {
      ...this.draft,
      dataRequirements: readNames(this.draft.body).filter((name) => !name.startsWith('input.') && name !== 'question'),
    };
    const original = this.original;
    try {
      const template = await savePromptTemplate(this.active, { ...data, ...(original ? { revision: original.revision } : {}) });
      this.templates.setItems(this.active
        ? this.templates.items.map((item) => item.id === template.id ? template : item)
        : [template, ...this.templates.items]);
      this.active = template.id;
      this.draft = copyTemplate(template);
      this.notice = '模板已保存。';
      this.preview = null;
    } catch (error) {
      this.error = errorMessage(error);
    } finally {
      this.pending = false;
    }
  }

  async remove(): Promise<void> {
    const original = this.original;
    if (!original) {
      this.draft = blank();
      return;
    }
    if (!await this.dialog.confirm(`删除模板“${original.title}”？`)) return;
    try {
      await deletePromptTemplate(original.id, original.revision);
      const next = this.templates.items.filter((template) => template.id !== original.id);
      this.templates.setItems(next);
      if (next[0]) this.select(next[0]);
      else {
        this.active = null;
        this.draft = blank();
      }
    } catch (error) {
      this.error = errorMessage(error);
    }
  }

  async generate(): Promise<void> {
    if (this._inFlight || this.sourceLoading || Boolean(this.snapshotId && !this.sourceSnapshot)) return;
    this._inFlight = true;
    const version = ++this._requestVersion;
    this.pending = true;
    this.error = '';
    this.preview = null;
    const selectedYears = this.years.split(/[，,、\s]+/).filter(Boolean).map(Number);
    if (this.usesYears && (!selectedYears.length || selectedYears.some((year) => !Number.isInteger(year) || year < 1901 || year > 2099) || selectedYears.length > 12)) {
      this.error = '请输入 1–12 个有效流年年份，以逗号分隔。';
      this.pending = false;
      this._inFlight = false;
      return;
    }
    const names = this.names;
    try {
      const result = await createPromptPreview({
        draft: { ...this.draft, dataRequirements: names.filter((name) => !name.startsWith('input.') && name !== 'question') },
        bindings: {
          ...((this.needZiwei || this.needProfile) && this.chartId ? { chartId: this.chartId } : {}),
          ...(this.needZiwei && this.snapshotId ? { snapshotId: this.snapshotId } : {}),
          ...(this.meihua && this.draft.system === 'meihua' ? { meihuaDraftId: this.meihua.id } : {}),
        },
        ...(this.usesDate ? { asOfDate: this.asOf } : {}),
        ...(this.usesMonths ? { months: { startMonth: this.start, count: this.count } } : {}),
        ...(this.usesYears ? { years: [...new Set(selectedYears)] } : {}),
        inputValues: this.values,
        question: this.question,
      });
      if (version === this._requestVersion) this.preview = result;
    } catch (error) {
      if (version === this._requestVersion) this.error = errorMessage(error);
    } finally {
      this._inFlight = false;
      this.pending = false;
    }
  }
}
