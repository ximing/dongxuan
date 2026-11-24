import { emptyPromptDocument, importLegacyPrompt, normalizePromptDocument, promptDocumentsEqual, removePromptVariable } from '@dongxuan/dto';
import type { PromptEditorHandle } from '@/components/ui/prompt-editor-handle';
import { Service } from '@rabjs/react';
import type { ChartRecordSummary, ChartSnapshot, MeihuaDraft, PromptField, PromptPreview, PromptTemplate, PromptTemplateInput, PromptVariable } from '@dongxuan/dto';
import { listAllCharts } from '@/api/charts';
import { apiAll } from '@/api/client';
import { createPromptPreview, deletePromptTemplate, getMeihuaDraft, getPromptSnapshot, listPromptVariables, savePromptTemplate } from '@/api/prompts';
import { errorMessage, monthNow, today } from '@/lib/format';
import { AuthService } from '@/services/auth.service';
import { DialogService } from '@/services/dialog.service';
import { copyTemplate, describeTemplate, monthRange, parseYears, readNames, templateNames, templatesEqual, bodyRequirements, validDate, validateTemplate, writeClipboard } from './prompt-model';

export type LibraryTemplate = PromptTemplateInput & { id: string };
type Mode = 'use' | 'edit';
type Filter = 'all' | 'favorite' | 'ziwei' | 'meihua';
const blank = (): PromptTemplateInput => ({ title: '新模板', system: 'ziwei', bodyJson: emptyPromptDocument(), inputsSchema: [], dataRequirements: [] });

export class PromptsService extends Service {
  templates: PromptTemplate[] = [];
  templatesLoading = false;
  templatesLoaded = false;
  templatesError = '';
  catalog: PromptVariable[] = [];
  catalogLoaded = false;
  charts: ChartRecordSummary[] = [];
  sourcesError = '';
  active: string | null = null;
  draft: PromptTemplateInput = blank();
  drafts: Record<string, PromptTemplateInput> = {};
  mode: Mode = 'use';
  filter: Filter = 'all';
  search = '';
  favorites: string[] = [];
  favoriteNotice = '';
  chartId = '';
  snapshotId = '';
  sourceSnapshot: ChartSnapshot | null = null;
  sourceLoading = false;
  sourceError = '';
  sourceNotice = '';
  meihua: MeihuaDraft | null = null;
  asOf = today();
  start = monthNow();
  count = 3;
  years = String(new Date().getFullYear());
  values: Record<string, string> = {};
  question = '';
  preview: PromptPreview | null = null;
  previewStale = false;
  diagnostics: string[] = [];
  fieldErrors: Record<string, string> = {};
  runError = '';
  editErrors: string[] = [];
  error = '';
  notice = '';
  savingId: string | null = null;
  deletingId: string | null = null;
  generating = false;
  copying = false;
  copyFailed = false;
  mobileView: 'fill' | 'result' = 'fill';
  sourceDetailsOpen = false;
  focusTarget = '';
  validationVersion = 0;
  selectTextVersion = 0;
  dialog: 'new' | 'variables' | 'legacy' | null = null;
  newTitle = '';
  newSystem: PromptTemplateInput['system'] = 'ziwei';
  newBase: 'blank' | 'current' = 'blank';
  variableSearch = '';
  legacyText = '';
  legacyError = '';
  // The closure captures a React ref; no editor instance enters reactive state.
  editorAccess: (() => PromptEditorHandle | null) | null = null;
  _explicitRequirements: Record<string, string[]> = {};
  _requirementBaselines: Record<string, { names: string[]; requirements: string[] }> = {};
  _initialSelected = false;
  _requestVersion = 0;
  _sourceVersion = 0;
  _draftVersion = 0;
  _templatesVersion = 0;
  _bootVersion = 0;
  _contextVersion = 0;
  _copyVersion = 0;
  _contextId = '';

  get original(): PromptTemplate | undefined { return this.templates.find(template => template.id === this.active); }
  get isNew(): boolean { return Boolean(this.active?.startsWith('draft:')); }
  get usage(): PromptTemplateInput { return this.original || blank(); }
  get names(): string[] { return templateNames(this.usage); }
  get editNames(): string[] { return readNames(this.draft.bodyJson); }
  get dirty(): boolean { return this.isNew || Boolean(this.original && !templatesEqual(this.original, this.draft)); }
  get hasDrafts(): boolean { return Object.keys(this.drafts).length > 0; }
  get canCopy(): boolean { return Boolean(this.preview?.text && !this.previewStale && !this.generating && !this.diagnostics.length); }
  get manualFields(): PromptField[] { return this.usage.inputsSchema.filter(field => this.uses('input.' + field.key)); }
  get needZiwei(): boolean { return this.names.some(name => name.startsWith('ziwei.') || name === 'range.label' || name === 'years.label') || (this.usage.system === 'ziwei' && this.uses('chart.title')); }
  get needProfile(): boolean { return this.names.some(name => name.startsWith('profile.')); }
  get needMeihua(): boolean { return this.names.some(name => name.startsWith('meihua.')) || (this.usage.system === 'meihua' && this.uses('chart.title')); }
  get usesMonths(): boolean { return this.uses('ziwei.months') || this.uses('range.label'); }
  get usesYears(): boolean { return this.uses('ziwei.years') || this.uses('years.label'); }
  get usesDate(): boolean { return this.names.some(name => ['ziwei.gender_age', 'ziwei.current', 'ziwei.decade_current', 'ziwei.decades'].includes(name)); }
  get rangeLabel(): string { return monthRange(this.start, this.count); }
  get usedSources(): PromptVariable[] { return this.catalog.filter(variable => this.names.includes(variable.name) && variable.source !== 'input'); }
  get editSources(): PromptVariable[] { return this.catalog.filter(variable => this.editNames.includes(variable.name) && variable.source !== 'input'); }
  get sourceLabel(): string {
    const query = this.sourceSnapshot?.query;
    if (!query) return '本命基础快照';
    if (query.mode === 'decadal') {
      const result = this.sourceSnapshot?.result;
      const period = result && 'decadal' in result ? result.decadal : undefined;
      return period ? `${period.range[0]}–${period.range[1]} 虚岁 · ${period.fromYear}–${period.toYear} 大限` : `${query.startAge} 虚岁起大限`;
    }
    if (query.mode === 'day') return query.date + (query.includeDaily ? ' · 含流日' : ' · 不含流日');
    if (query.mode === 'months') return query.startMonth + ' 起连续 ' + query.count + ' 个月';
    if (query.mode === 'years') return query.years.join('、') + ' 流年';
    return query.asOfDate + ' 当前 / 下一大限';
  }
  get library(): LibraryTemplate[] {
    return [...this.templates, ...Object.entries(this.drafts).filter(([id]) => id.startsWith('draft:')).map(([id, value]) => ({ ...value, id }))];
  }
  get filteredTemplates(): LibraryTemplate[] {
    const query = this.search.trim().toLocaleLowerCase();
    return this.library.filter(template => {
      const matches = this.filter === 'all' || (this.filter === 'favorite' ? this.favorites.includes(template.id) : template.system === this.filter);
      return matches && (template.title + describeTemplate(template)).toLocaleLowerCase().includes(query);
    });
  }
  get availableVariables(): PromptVariable[] {
    const fields: PromptVariable[] = this.draft.inputsSchema.map(field => ({ name: 'input.' + field.key, label: field.label, source: '本次填写', status: 'available' }));
    const query = this.variableSearch.trim().toLocaleLowerCase();
    return [...fields, ...this.catalog].filter(variable => (variable.label + variable.name + variable.source).toLocaleLowerCase().includes(query));
  }
  uses(name: string): boolean { return this.names.includes(name); }
  hasDraft(id: string): boolean { return Boolean(this.drafts[id]); }
  setSearch(value: string): void { this.search = value; }
  setFilter(value: Filter): void { this.filter = value; }
  setMobileView(value: 'fill' | 'result'): void { this.mobileView = value; }
  setSourceDetailsOpen(value: boolean): void { this.sourceDetailsOpen = value; }

  async boot(): Promise<void> {
    const version = ++this._bootVersion;
    this.loadFavorites();
    await Promise.all([
      this.loadTemplates(),
      listPromptVariables().then(catalog => {
        if (version === this._bootVersion) { this.catalog = catalog; this.catalogLoaded = true; }
      }).catch(error => { if (version === this._bootVersion) this.error = errorMessage(error); }),
      this.loadCharts(),
    ]);
  }
  async loadTemplates(): Promise<void> {
    const version = ++this._templatesVersion;
    this.templatesLoading = true; this.templatesError = '';
    try {
      // Search and filters cover every page, including templates beyond the first 50.
      const templates = await apiAll<PromptTemplate>('/api/v2/prompt-templates');
      if (version !== this._templatesVersion) return;
      this.templates = templates; this.templatesLoaded = true;
      if (this.active && this.original) {
        if (!this.drafts[this.active]) {
          const names = readNames(this.original.bodyJson);
          this._requirementBaselines[this.active] = { names, requirements: [...this.original.dataRequirements] };
          this._explicitRequirements[this.active] = this.original.dataRequirements.filter(name => !names.includes(name));
        }
        this.draft = copyTemplate(this.drafts[this.active] || this.original);
        this.invalidate();
      }
    } catch (error) { if (version === this._templatesVersion) this.templatesError = errorMessage(error); }
    finally { if (version === this._templatesVersion) this.templatesLoading = false; }
  }
  async loadCharts(): Promise<void> {
    const version = this._bootVersion;
    this.sourcesError = '';
    try { const charts = await listAllCharts(); if (version === this._bootVersion) this.charts = charts; }
    catch (error) { if (version === this._bootVersion) this.sourcesError = errorMessage(error); }
  }
  selectInitial(system: string | null): void {
    if (this._initialSelected || !this.templatesLoaded) return;
    if (this.active) { this._initialSelected = true; return; }
    const preferred = system === 'meihua'
      ? this.templates.find(template => template.system === 'meihua' && template.title.includes('原始')) || this.templates.find(template => template.system === 'meihua')
      : this.templates.find(template => template.system === 'ziwei') || this.templates[0];
    if (preferred) this.select(preferred);
    this._initialSelected = true;
  }
  select(template: LibraryTemplate): void {
    if (template.id === this.active || !this.flushEditor()) return;
    if (!this._explicitRequirements[template.id] || !this.drafts[template.id]) {
      const names = new Set(readNames(template.bodyJson));
      this._explicitRequirements[template.id] = template.dataRequirements.filter(name => !names.has(name));
    }
    if (!this._requirementBaselines[template.id] || !this.drafts[template.id]) this._requirementBaselines[template.id] = { names: readNames(template.bodyJson), requirements: [...template.dataRequirements] };
    this.active = template.id; this.draft = copyTemplate(this.drafts[template.id] || template);
    this.values = {}; this.question = '';
    if (template.system === 'meihua' && this.meihua) this.applyMeihua();
    this.invalidate(); this.preview = null; this.previewStale = false;
    this.editErrors = []; this.notice = ''; this.error = ''; this.mobileView = 'fill';
    if (this.isNew) this.mode = 'edit';
  }
  setMode(mode: Mode): void {
    if ((mode === 'use' && !this.original) || !this.flushEditor()) return;
    this.mode = mode; this.editErrors = [];
  }
  change(patch: Partial<PromptTemplateInput>): void {
    const explicitRequirements = patch.dataRequirements !== undefined;
    if (patch.bodyJson) {
      const bodyJson = normalizePromptDocument(patch.bodyJson);
      const bodyChanged = !promptDocumentsEqual(this.draft.bodyJson, bodyJson);
      patch = { ...patch, bodyJson, ...(bodyChanged && !patch.dataRequirements ? { dataRequirements: bodyRequirements(this.draft, bodyJson, this.active ? this._explicitRequirements[this.active] || [] : [], this.active ? this._requirementBaselines[this.active] : undefined) } : {}) };
    }
    if (explicitRequirements && patch.dataRequirements && this.active) {
      const names = new Set(readNames(patch.bodyJson || this.draft.bodyJson));
      this._explicitRequirements[this.active] = patch.dataRequirements.filter(name => !names.has(name));
      const baseline = this._requirementBaselines[this.active];
      this._requirementBaselines[this.active] = { names: baseline?.names || [...names], requirements: [...patch.dataRequirements] };
    }
    this.draft = { ...this.draft, ...patch };
    if (!this.active) return;
    if (this.dirty) this.drafts = { ...this.drafts, [this.active]: copyTemplate(this.draft) };
    else this.clearDraft(this.active);
    this.editErrors = [];
  }
  clearDraft(id: string): void { const next = { ...this.drafts }; delete next[id]; this.drafts = next; }
  openNew(copy = false): void {
    this.newTitle = copy && this.original ? this.original.title.slice(0, 74) + ' · 副本' : '';
    this.newSystem = this.original?.system || this.draft.system;
    this.newBase = copy && this.original ? 'current' : 'blank'; this.dialog = 'new';
  }
  setNewTitle(value: string): void { this.newTitle = value; }
  setNewSystem(value: string): void { this.newSystem = value as PromptTemplateInput['system']; }
  setNewBase(value: 'blank' | 'current'): void { this.newBase = value; }
  closeDialog(): void {
    const restore = this.dialog === 'variables' || this.dialog === 'legacy';
    this.dialog = null;
    if (restore) requestAnimationFrame(() => this.editorAccess?.()?.focusSelection());
  }
  attachEditor(access: (() => PromptEditorHandle | null) | null): void { this.editorAccess = access; }
  flushEditor(): boolean {
    if (this.mode !== 'edit') return true;
    const editor = this.editorAccess?.();
    if (!editor) return true;
    if (editor.isComposing()) { this.notice = '请先完成当前文字输入。'; return false; }
    try {
      const bodyJson = editor.getDocument();
      if (!templatesEqual(this.draft, { ...this.draft, bodyJson })) this.change({ bodyJson });
      return true;
    } catch (error) { this.editErrors = [errorMessage(error)]; return false; }
  }
  openLegacyImport(): void {
    if (!this.flushEditor()) return;
    this.editorAccess?.()?.rememberSelection();
    this.legacyText = ''; this.legacyError = ''; this.dialog = 'legacy';
  }
  setLegacyText(value: string): void { this.legacyText = value; this.legacyError = ''; }
  importLegacy(): void {
    try {
      this.change({ bodyJson: importLegacyPrompt(this.legacyText) }); this.dialog = null;
      this.notice = '已替换正文并导入旧模板引用，请检查中文资料标签。';
    } catch (error) { this.legacyError = errorMessage(error); }
  }
  reportEditorError(message: string): void { this.editErrors = [message]; }
  reportPasteNotice(): void { this.notice = '粘贴内容已保留文字与基础格式，其他格式和资源已移除。'; }

  createDraft(): void {
    if (!this.newTitle.trim()) return;
    const input = this.newBase === 'current' && this.original ? copyTemplate(this.original) : blank();
    input.title = this.newTitle.trim(); input.system = this.newSystem;
    const id = 'draft:' + crypto.randomUUID();
    this.drafts = { ...this.drafts, [id]: input };
    this.select({ ...input, id }); this.mode = 'edit'; this.dialog = null;
    this.notice = '草稿已创建，编辑后保存即可使用。';
  }
  revert(): void {
    if (!this.active || this.savingId === this.active) return;
    const id = this.active, original = this.original;
    this.clearDraft(id); this.editErrors = []; delete this._explicitRequirements[id]; delete this._requirementBaselines[id];
    if (original) {
      this.draft = copyTemplate(original);
      const names = new Set(readNames(original.bodyJson));
      this._explicitRequirements[id] = original.dataRequirements.filter(name => !names.has(name));
      this._requirementBaselines[id] = { names: [...names], requirements: [...original.dataRequirements] };
    }
    else {
      this.active = null;
      if (this.templates[0]) this.select(this.templates[0]); else this.draft = blank();
      this.mode = 'use';
    }
    this.notice = original ? '已撤销模板修改。' : '已放弃未保存的新模板。';
  }
  addField(): void {
    if (this.draft.inputsSchema.length >= 16) return;
    const keys = new Set([...this.draft.inputsSchema.map(field => field.key), ...this.editNames.filter(name => name.startsWith('input.')).map(name => name.slice(6))]);
    let index = 1; while (keys.has('field_' + index)) index += 1;
    this.change({ inputsSchema: [...this.draft.inputsSchema, { key: 'field_' + index, label: '新填写项', type: 'textarea', required: true, missingPolicy: 'block' }] });
  }
  updateField(index: number, patch: Partial<PromptField>): void {
    this.change({ inputsSchema: this.draft.inputsSchema.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field) });
  }
  removeField(index: number): void {
    const field = this.draft.inputsSchema[index]; if (!field) return;
    const bodyJson = removePromptVariable(this.draft.bodyJson, 'input.' + field.key);
    const name = 'input.' + field.key, id = this.active;
    const dataRequirements = bodyRequirements(this.draft, bodyJson, id ? this._explicitRequirements[id] || [] : [], id ? this._requirementBaselines[id] : undefined).filter(requirement => requirement !== name);
    if (id) {
      this._explicitRequirements[id] = (this._explicitRequirements[id] || []).filter(requirement => requirement !== name);
      const baseline = this._requirementBaselines[id];
      if (baseline) this._requirementBaselines[id] = { ...baseline, requirements: baseline.requirements.filter(requirement => requirement !== name) };
    }
    this.change({ bodyJson, dataRequirements, inputsSchema: this.draft.inputsSchema.filter((_, fieldIndex) => fieldIndex !== index) });
    this.notice = '已移除填写项与对应引用，保存前可撤销修改。';
  }
  openVariables(): void {
    if (!this.flushEditor()) return;
    this.editorAccess?.()?.rememberSelection(); this.variableSearch = ''; this.dialog = 'variables';
  }
  setVariableSearch(value: string): void { this.variableSearch = value; }
  insert(name: string): void {
    if (this.savingId === this.active) return;
    this.editorAccess?.()?.insertVariable(name); this.dialog = null;
    requestAnimationFrame(() => this.editorAccess?.()?.focusSelection());
  }
  async save(): Promise<void> {
    if (!this.active || this.savingId || this.templatesLoading || this.deletingId === this.active) return;
    if (!this.flushEditor()) return;
    const id = this.active;
    const data = { ...copyTemplate(this.draft), title: this.draft.title.trim() };
    this.editErrors = validateTemplate(data, this.catalog); if (this.editErrors.length) return;
    const original = this.original, submitted = copyTemplate(this.draft);
    this.savingId = id;
    try {
      const template = await savePromptTemplate(original ? id : null, { ...data, ...(original ? { revision: original.revision } : {}) });
      this.templates = original ? this.templates.map(item => item.id === template.id ? template : item) : [template, ...this.templates];
      const unchanged = !this.drafts[id] || templatesEqual(this.drafts[id], submitted), newerDraft = this.drafts[id];
      this._explicitRequirements[template.id] = this._explicitRequirements[id] || [];
      this._requirementBaselines[template.id] = { names: readNames(template.bodyJson), requirements: [...template.dataRequirements] };
      this.clearDraft(id);
      if (!unchanged && newerDraft) this.drafts = { ...this.drafts, [template.id]: newerDraft };
      if (this.active === id) {
        this.active = template.id; this.draft = copyTemplate(unchanged ? template : newerDraft);
        this.mode = unchanged ? 'use' : 'edit'; this.invalidate(); this.mobileView = 'fill';
      }
      this.notice = '模板“' + template.title + '”已保存。';
    } catch (error) {
      if (this.active === id) this.editErrors = [errorMessage(error)];
      else this.error = '模板保存失败，草稿已保留：' + errorMessage(error);
    } finally { this.savingId = null; }
  }
  async remove(): Promise<void> {
    const template = this.original;
    if (!template || this.savingId === template.id || this.deletingId) return;
    if (!await this.resolve(DialogService).confirm('删除模板“' + template.title + '”？未保存的草稿也会移除。')) return;
    this.deletingId = template.id;
    try {
      await deletePromptTemplate(template.id, template.revision);
      this.templates = this.templates.filter(item => item.id !== template.id);
      this.clearDraft(template.id); this.favorites = this.favorites.filter(id => id !== template.id); this.persistFavorites();
      if (this.active === template.id) {
        this.active = null; this.invalidate(); this.preview = null; this.mode = 'use';
        if (this.library[0]) this.select(this.library[0]);
      }
      this.notice = '模板已删除。';
    } catch (error) { this.error = errorMessage(error); }
    finally { this.deletingId = null; }
  }
  get favoriteKey(): string { return 'dongxuan:prompt-favorites:' + (this.resolve(AuthService).user?.id || 'anonymous'); }
  loadFavorites(): void {
    try { const value: unknown = JSON.parse(localStorage.getItem(this.favoriteKey) || '[]'); this.favorites = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; }
    catch { this.favorites = []; }
  }
  persistFavorites(): void {
    try { localStorage.setItem(this.favoriteKey, JSON.stringify(this.favorites)); this.favoriteNotice = ''; }
    catch { this.favoriteNotice = '常用标记仅在当前页面保留。'; }
  }
  toggleFavorite(): void {
    if (!this.original) return;
    const id = this.original.id;
    this.favorites = this.favorites.includes(id) ? this.favorites.filter(item => item !== id) : [...this.favorites, id];
    this.persistFavorites();
  }
  applyMeihua(): void {
    if (!this.meihua) return;
    this.values = { question: this.meihua.question, number_a: String(this.meihua.numberA), number_b: String(this.meihua.numberB) }; this.question = this.meihua.question;
  }
  async loadDraft(id: string): Promise<void> {
    if (!id || this._contextId === id) return;
    const version = ++this._draftVersion, context = this._contextVersion;
    try {
      const draft = await getMeihuaDraft(id);
      if (version !== this._draftVersion || context !== this._contextVersion) return;
      this.meihua = draft; if (!this.chartId && draft.chartId) this.chartId = draft.chartId;
      if (this.usage.system === 'meihua') this.applyMeihua();
      this._contextId = id; this.invalidate();
    } catch (error) { if (version === this._draftVersion) this.error = errorMessage(error); }
  }
  cancelDraft(): void { this._draftVersion += 1; }
  async loadSnapshot(sourceId: string, chartFromUrl: string | null): Promise<void> {
    const version = ++this._sourceVersion;
    this.sourceLoading = true; this.sourceError = ''; this.invalidate();
    try {
      const source = await getPromptSnapshot(sourceId);
      if (version !== this._sourceVersion) return;
      if (chartFromUrl && source.chartId !== chartFromUrl) throw new Error('保存视图不属于当前命盘，请核对来源。');
      if (this.chartId && this.chartId !== source.chartId) { this.values = {}; this.question = ''; this.meihua = null; }
      this.sourceSnapshot = source; this.snapshotId = source.id; this.chartId = source.chartId;
      if (source.query?.mode === 'day') this.asOf = source.query.date;
      if (source.query?.mode === 'months') { this.start = source.query.startMonth; this.count = source.query.count; }
      if (source.query?.mode === 'years') this.years = source.query.years.join(', ');
      if (source.query?.mode === 'decades') this.asOf = source.query.asOfDate;
      this.sourceNotice = ''; this.invalidate();
    } catch (error) { if (version === this._sourceVersion) this.sourceError = errorMessage(error); }
    finally { if (version === this._sourceVersion) this.sourceLoading = false; }
  }
  cancelSnapshot(): void { this._sourceVersion += 1; }
  clearSnapshotBinding(): void {
    this._sourceVersion += 1;
    const hadBinding = Boolean(this.snapshotId);
    this.snapshotId = ''; this.sourceSnapshot = null; this.sourceLoading = false; this.sourceError = '';
    this.sourceNotice = hadBinding ? '已改用基础命盘，按当前时间条件重新取数。' : ''; this.invalidate();
  }
  invalidate(): void {
    this._requestVersion += 1; this._copyVersion += 1;
    this.previewStale = Boolean(this.preview); this.generating = false; this.copying = false; this.copyFailed = false;
    this.diagnostics = []; this.runError = ''; this.fieldErrors = {}; this.notice = '';
  }
  selectChart(value: string): void {
    if (this.chartId === value) return;
    this.chartId = value; this._contextVersion += 1; this.meihua = null; this.values = {}; this.question = '';
    this.clearSnapshotBinding(); this.notice = '已更换命盘，并清空上一个人的本次填写。';
  }
  setAsOf(value: string): void { this.asOf = value; this.contextChanged(); }
  setStart(value: string): void { this.start = value; this.contextChanged(); }
  setCount(value: number): void { this.count = value; this.contextChanged(); }
  setYears(value: string): void { this.years = value; this.contextChanged(); }
  contextChanged(): void { this._contextVersion += 1; if (this.snapshotId) this.clearSnapshotBinding(); else this.invalidate(); }
  setQuestion(value: string): void { this.question = value; this._contextVersion += 1; this.invalidate(); }
  setInputValue(key: string, value: string): void { this.values = { ...this.values, [key]: value }; this._contextVersion += 1; this.invalidate(); }
  validateRun(): boolean {
    const errors: Record<string, string> = {};
    if ((this.needZiwei || this.needProfile) && !this.chartId) errors['prompt-chart'] = '请选择一张命盘。';
    if (this.usesMonths && !this.rangeLabel) errors['prompt-month'] = '请选择完整的 1–12 个月范围，不能超出 1901–2099 年。';
    const years = parseYears(this.years);
    if (this.usesYears && (!years.length || years.length > 12 || years.some(year => !Number.isInteger(year) || year < 1901 || year > 2099))) errors['prompt-years'] = '请输入 1–12 个 1901–2099 年之间的流年。';
    if (this.usesDate && !validDate(this.asOf)) { errors['prompt-date'] = '请选择 1901–2099 年间的有效基准日。'; this.sourceDetailsOpen = true; }
    if (this.uses('question') && !this.question.trim()) errors['prompt-question'] = '请填写本次问题。';
    for (const field of this.manualFields) {
      const value = (this.values[field.key] || '').trim(), id = 'prompt-input-' + field.key;
      if (field.required && !value) errors[id] = '请填写' + field.label + '。';
      else if (value && field.type === 'integer' && !Number.isSafeInteger(Number(value))) errors[id] = field.label + '需要填写安全范围内的整数。';
    }
    this.fieldErrors = errors; this.diagnostics = [];
    if (this.needMeihua) this.diagnostics.push('完整梅花卦象尚未接入，暂时无法生成。可以改用“梅花原始起卦请求”提交问题和数字。');
    if (this.names.some(name => name.startsWith('bazi.'))) this.diagnostics.push('独立八字命盘尚未接入，不能用紫微四柱替代。');
    if (this.needZiwei && (this.sourceLoading || (this.snapshotId && !this.sourceSnapshot))) this.diagnostics.push(this.sourceError || '保存视图尚未载入，请重试或改用基础命盘。');
    this.focusTarget = Object.keys(errors)[0] || 'prompt-run-errors';
    if (Object.keys(errors).length || this.diagnostics.length) { this.mobileView = 'fill'; this.validationVersion += 1; return false; }
    return true;
  }
  async generate(copy = false): Promise<void> {
    if (this.generating || !this.original || this.deletingId === this.active) return;
    this.invalidate(); if (!this.validateRun()) return;
    const version = this._requestVersion, template = this.original;
    this.generating = true;
    try {
      const result = await createPromptPreview({
        templateId: template.id, revision: template.revision,
        bindings: {
          ...((this.needZiwei || this.needProfile) && this.chartId ? { chartId: this.chartId } : {}),
          ...(this.needZiwei && this.snapshotId ? { snapshotId: this.snapshotId } : {}),
          ...(this.meihua && template.system === 'meihua' ? { meihuaDraftId: this.meihua.id } : {}),
        },
        ...(this.usesDate ? { asOfDate: this.asOf } : {}),
        ...(this.usesMonths ? { months: { startMonth: this.start, count: this.count } } : {}),
        ...(this.usesYears ? { years: parseYears(this.years) } : {}),
        inputValues: { ...this.values }, question: this.question,
      });
      if (version !== this._requestVersion) return;
      this.diagnostics = result.diagnostics;
      if (result.diagnostics.length || !result.text) {
        if (!result.diagnostics.length) this.runError = '未生成完整文本，请核对资料后重试。';
        this.mobileView = 'fill'; this.focusTarget = 'prompt-run-errors'; this.validationVersion += 1; return;
      }
      this.preview = result; this.previewStale = false; this.mobileView = 'result'; this.generating = false;
      if (copy) await this.copy(true); else this.notice = '预览已生成，检查后可以复制。';
    } catch (error) {
      if (version === this._requestVersion) { this.runError = errorMessage(error); this.mobileView = 'fill'; this.focusTarget = 'prompt-run-errors'; this.validationVersion += 1; }
    } finally { if (version === this._requestVersion) this.generating = false; }
  }
  async copy(generated = false): Promise<void> {
    if (!this.canCopy || this.copying || !this.preview) return;
    const version = ++this._copyVersion;
    this.copying = true;
    const success = await writeClipboard(this.preview.text);
    if (version !== this._copyVersion) return;
    this.copying = false; this.copyFailed = !success;
    this.notice = success ? (generated ? '已生成并复制完整提示词。' : '已复制完整提示词。') : '完整提示词已生成，浏览器未允许自动复制。请再次点“复制”，或选择全文手动复制。';
    if (!success && !generated) this.selectTextVersion += 1;
  }
  dispose(): void {
    this._bootVersion += 1; this._templatesVersion += 1; this._draftVersion += 1; this._sourceVersion += 1; this._requestVersion += 1; this._copyVersion += 1;
  }
  constructor() {
    super();
    const params = new URLSearchParams(window.location.search);
    this.chartId = params.get('chart') || ''; this.snapshotId = params.get('snapshot') || ''; this.sourceLoading = Boolean(this.snapshotId);
    this.asOf = params.get('date') || today(); this.start = params.get('start') || monthNow(); this.count = Number(params.get('count')) || 3;
  }
}
