import { Service } from '@rabjs/react';
import type { BirthProfile, ChartRecord, HoroscopeLayer, ViewChartSnapshot, ViewPreview, ZiweiDayResult, ZiweiFlowOptions, ZiweiQuery, ZiweiViewResult } from '@dongxuan/dto';
import { getChart, getChartFlowOptions, getSnapshot, patchChart, previewChartView, reviseChart, saveChartView } from '@/api/charts';
import { errorMessage, monthNow, today } from '@/lib/format';
import { PagedList } from '@/lib/paged-list';

export type ChartLevel = 'natal' | 'decadal' | 'yearly' | 'monthly' | 'daily';
type FlowLevel = Exclude<ChartLevel, 'natal'>;

export class ChartService extends Service {
  chart: ChartRecord | null = null;
  preview: ViewPreview | null = null;
  saved: ViewChartSnapshot | null = null;
  views = new PagedList<ViewChartSnapshot>();
  error = '';
  message = '';
  pending = false;
  level: ChartLevel = 'natal';
  tab = 'board';
  date = today();
  start = monthNow();
  count = 3;
  segmentId = '';
  menu = false;
  menuMode = '';
  newTitle = '';
  newRelation = '';
  newRemark = '';
  birthDraft: BirthProfile = { calendar: 'solar' };
  focus = false;
  flowOptions: ZiweiFlowOptions | null = null;
  periodsLoading = false;
  periodsError = '';
  selectedStartAge: number | null | undefined = undefined;
  childhoodDate = '';
  _periodVersion = 0;
  _requestVersion = 0;
  _inFlight = false;
  _openVersion = 0;
  _savedVersion = 0;
  retainedView: { result: ZiweiViewResult; level: ChartLevel } | null = null;
  snapshotLoading = false;

  get base() {
    return this.chart?.baseSnapshot ?? null;
  }

  get viewResult() {
    return this.saved?.result || this.preview?.result || this.retainedView?.result;
  }

  get displayLevel(): ChartLevel {
    if (!this.saved && !this.preview && this.retainedView) return this.retainedView.level;
    const query = this.saved?.query || this.preview?.result.query;
    return query?.mode === 'day' ? query.level : query?.mode === 'decadal' ? 'decadal' : this.level;
  }
  get staleView(): boolean { return Boolean(this.retainedView && !this.saved && !this.preview); }
  get viewUpdating(): boolean { return !this.savingView && (this.pending || this.periodsLoading || this.snapshotLoading); }
  get viewActionsDisabled(): boolean { return this.staleView || this.pending || this.periodsLoading || this.snapshotLoading; }

  get selectionNote(): string {
    const options = this.flowOptions;
    if (this.level === 'monthly' && this.selectedMonth) return `阳历 ${this.selectedMonth.from} 至 ${this.selectedMonth.to} · 闰月分上下半月`;
    if (this.level === 'yearly') return '春节换年，选择后自动更新。';
    if (this.level === 'daily') return '按阳历日期定位流日，选择后自动更新。';
    if (this.level === 'decadal' && options) {
      if (options.currentAge < 1) return '出生前默认首个区间 · 年龄为虚岁';
      if (options.currentStartAge == null && options.currentAge >= options.decades[0].startAge) return '当前年份超出大限范围，默认最后一个原生区间。';
      return `默认当前大限 · 虚岁 · 春节换年 · 共 ${options.decades.length} 组`;
    }
    return '春节年界 · 晚子归次日';
  }

  get activeDay(): ZiweiDayResult | undefined {
    const result = this.viewResult;
    if (!result) return undefined;
    if (result.day) return result.day;
    const viewId = this.segmentId || result.segments[0]?.viewId;
    return viewId ? result.views[viewId] : undefined;
  }

  get layers(): HoroscopeLayer[] {
    if (this.displayLevel === 'natal') return [];
    if (this.viewResult?.decadal) return [this.viewResult.decadal.layer];
    const day = this.activeDay;
    if (!day) return [];
    const count = ['decadal', 'yearly', 'monthly', 'daily'].indexOf(this.displayLevel) + 1;
    return [day.decadal, day.yearly, day.monthly, day.daily].slice(0, count).filter((layer): layer is HoroscopeLayer => Boolean(layer));
  }

  get flowLayer(): HoroscopeLayer | undefined {
    if (this.displayLevel === 'natal') return undefined;
    if (this.displayLevel === 'decadal' && this.viewResult?.decadal) return this.viewResult.decadal.layer;
    return this.dayLayer(this.displayLevel);
  }

  get selectedMonth() { return this.flowOptions?.months.find(month => month.from <= this.date && month.to >= this.date); }
  get flowHeading(): string {
    const decade = this.viewResult?.decadal;
    if (decade) return `${decade.range[0]}–${decade.range[1]} 虚岁 · ${decade.fromYear}–${decade.toYear}`;
    return this.activeDay ? `${this.activeDay.date} · ${this.activeDay.nominalAge} 虚岁` : '';
  }
  get savingView(): boolean { return this._inFlight; }

  async loadFlowOptions(year?: number): Promise<ZiweiFlowOptions | null> {
    const chart = this.chart;
    if (!chart) return null;
    const version = ++this._periodVersion;
    this.periodsLoading = true;
    this.periodsError = '';
    try {
      const options = await getChartFlowOptions(chart.id, this.date, year);
      if (version !== this._periodVersion || this.chart?.id !== chart.id) return null;
      this.flowOptions = options;
      this.date = options.date;
      if (this.selectedStartAge === undefined) this.selectedStartAge = options.defaultStartAge;
      return options;
    } catch (error) {
      if (version === this._periodVersion) this.periodsError = errorMessage(error);
      return null;
    } finally {
      if (version === this._periodVersion) this.periodsLoading = false;
    }
  }

  async calculateCurrent(): Promise<void> {
    const level = this.level;
    if (level === 'natal' || !this.flowOptions) return;
    if (level === 'decadal' && this.selectedStartAge != null) {
      await this.calculate({ mode: 'decadal', startAge: this.selectedStartAge });
    } else {
      await this.calculate({ mode: 'day', date: level === 'decadal' ? this.childhoodDate || this.flowOptions.asOfDate : this.date, includeDaily: level === 'daily', level });
    }
  }

  async selectDecade(value: string): Promise<void> {
    this.invalidate(true);
    this.selectedStartAge = value === 'childhood' ? null : Number(value);
    await this.calculateCurrent();
  }

  async selectYear(value: string): Promise<void> {
    this.invalidate(true);
    const version = this._requestVersion;
    const previous = this.selectedMonth;
    const options = await this.loadFlowOptions(Number(value));
    if (!options || version !== this._requestVersion) return;
    this.date = this.level === 'monthly'
      ? (options.months.find(month => month.month === previous?.month && month.isLeapMonth === previous?.isLeapMonth && month.part === previous?.part)?.from ?? options.months[0]?.from ?? options.yearDate)
      : options.yearDate;
    await this.calculateCurrent();
  }

  async selectMonth(id: string): Promise<void> {
    const month = this.flowOptions?.months.find(item => item.id === id);
    if (!month) return;
    this.invalidate(true);
    this.date = month.from;
    await this.calculateCurrent();
  }

  async selectDate(date: string): Promise<void> {
    if (!date) return;
    this.invalidate(true);
    const version = this._requestVersion;
    this.date = date;
    if (await this.loadFlowOptions() && version === this._requestVersion) await this.calculateCurrent();
  }

  get text(): string {
    return this.viewResult?.text || this.base?.text || '';
  }

  dayLayer(level: FlowLevel): HoroscopeLayer | undefined {
    const day = this.activeDay;
    if (!day) return undefined;
    if (level === 'daily') return day.daily;
    return day[level];
  }

  async open(id: string): Promise<void> {
    const version = ++this._openVersion;
    this.invalidate();
    this._periodVersion += 1;
    this.flowOptions = null;
    this.selectedStartAge = undefined;
    this.childhoodDate = '';
    this.level = 'natal';
    this.date = today();
    this.chart = null;
    this.preview = null;
    this.saved = null;
    this.error = '';
    this.views.reload(`/api/v2/charts/${id}/views`);
    try {
      const chart = await getChart(id);
      if (version !== this._openVersion) return;
      this.chart = chart;
      this.newTitle = chart.title;
      this.newRelation = chart.relation || '';
      this.newRemark = chart.remark || '';
      await this.loadFlowOptions();
      if (version === this._openVersion && !this.saved) await this.calculateCurrent();
    } catch (error) {
      if (version === this._openVersion) this.error = errorMessage(error);
    }
  }

  cancelOpen(): void {
    this._openVersion += 1;
    this._periodVersion += 1;
    this.invalidate();
    this.views.cancel();
  }

  async loadSaved(chartId: string | undefined, snapshotId: string | null): Promise<void> {
    const version = ++this._savedVersion;
    if (!snapshotId) {
      this.saved = null;
      this.snapshotLoading = false;
      return;
    }
    this.snapshotLoading = true;
    try {
      const saved = await getSnapshot(snapshotId);
      if (version !== this._savedVersion) return;
      if (saved.chartId !== chartId) throw new Error('保存视图不属于当前命盘');
      this._requestVersion += 1;
      this.pending = false;
      this.saved = saved;
      this.retainedView = null;
      this.preview = null;
      if (saved.query.mode === 'decadal') {
        this.selectedStartAge = saved.query.startAge;
        this.level = 'decadal';
        this.tab = 'board';
      } else if (saved.query.mode === 'day') {
        this.date = saved.query.date;
        this.level = saved.query.level;
        this.tab = 'board';
        if (saved.query.level === 'decadal') {
          this.selectedStartAge = saved.result.day?.decadal.range?.[0] ?? null;
          this.childhoodDate = this.selectedStartAge == null ? saved.query.date : '';
        }
      } else if (saved.query.mode === 'months') {
        this.start = saved.query.startMonth;
        this.count = saved.query.count;
        this.tab = 'months';
      }
      if (this.chart?.id === chartId && saved.query.mode === 'day') await this.loadFlowOptions();
    } catch (error) {
      if (version === this._savedVersion) this.error = errorMessage(error);
    } finally {
      if (version === this._savedVersion) this.snapshotLoading = false;
    }
  }

  cancelSaved(): void {
    this._savedVersion += 1;
    this.snapshotLoading = false;
  }

  invalidate(keepDisplay = false): void {
    this.retainedView = keepDisplay && this.viewResult ? { result: this.viewResult, level: this.displayLevel } : null;
    this._requestVersion += 1;
    this._savedVersion += 1;
    this.pending = false;
    this.snapshotLoading = false;
    this.preview = null;
    this.saved = null;
    this.message = '';
    if (!keepDisplay) this.segmentId = '';
  }

  setLevel(level: ChartLevel): void {
    if (level === this.level) return;
    this.invalidate(level !== 'natal');
    this.level = level;
    void this.calculateCurrent();
  }

  setTab(tab: string): void {
    this.tab = tab;
  }

  setStart(value: string): void {
    this.start = value;
  }

  setCount(value: number): void {
    this.count = value;
  }

  setSegment(id: string): void {
    this.segmentId = id;
  }

  toggleMenu(): void {
    this.menu = !this.menu;
    this.menuMode = '';
  }

  setMenuMode(mode: string): void {
    this.menuMode = mode;
    if (!this.chart) return;
    if (mode === 'rename') {
      this.newTitle = this.chart.title;
      this.newRelation = this.chart.relation || '';
      this.newRemark = this.chart.remark || '';
      this.menu = false;
      return;
    }
    if (mode !== 'birth') return;
    const input = this.chart.baseSnapshot?.input;
    this.birthDraft = {
      calendar: this.chart.calendar,
      date: this.chart.date,
      timeIndex: this.chart.timeIndex,
      gender: this.chart.gender,
      isLeapMonth: input?.isLeapMonth,
      clock: input?.clock,
    };
    this.menu = false;
  }

  setBirthDraft(value: BirthProfile): void {
    this.birthDraft = value;
  }

  setNewTitle(value: string): void {
    this.newTitle = value;
  }

  setNewRelation(value: string): void {
    this.newRelation = value;
  }

  setNewRemark(value: string): void {
    this.newRemark = value;
  }

  toggleFocus(): void {
    this.focus = !this.focus;
  }

  setFocus(value: boolean): void {
    this.focus = value;
  }

  bindMenu(root: HTMLElement | null): () => void {
    if (!root) return () => {};
    const close = (event: PointerEvent) => {
      if (!root.contains(event.target as Node)) this.menu = false;
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.menu = false;
        root.querySelector('button')?.focus();
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[role=menu] > button'));
        if (!buttons.length) return;
        event.preventDefault();
        let index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        index = (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[index]?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', keys);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', keys);
    };
  }

  async calculate(query: ZiweiQuery): Promise<void> {
    if (this._inFlight || !this.chart) return;
    const chartId = this.chart.id;
    const version = ++this._requestVersion;
    this.pending = true;
    this.error = '';
    this.message = '';
    try {
      const next = await previewChartView(chartId, query);
      if (version !== this._requestVersion || chartId !== this.chart?.id) return;
      this.preview = next;
      this.retainedView = null;
      this.saved = null;
      this.segmentId = '';
    } catch (error) {
      if (version === this._requestVersion) this.error = errorMessage(error);
    } finally {
      if (version === this._requestVersion) this.pending = false;
    }
  }

  async reviseBirth(): Promise<boolean> {
    const chart = this.chart;
    const birth = this.birthDraft;
    if (!chart) return false;
    if (birth.timeIndex === undefined || !birth.gender || !birth.date) {
      this.error = '请补齐出生日期、性别与时辰。';
      return false;
    }
    this.pending = true;
    this.error = '';
    try {
      this.chart = await reviseChart(chart.id, { ...birth, title: chart.title, calendar: birth.calendar || 'solar', system: 'ziwei' });
      this.menuMode = '';
      this.invalidate();
      this.selectedStartAge = undefined;
      this.childhoodDate = '';
      this.flowOptions = null;
      await this.loadFlowOptions();
      await this.calculateCurrent();
      this.views.reload(`/api/v2/charts/${chart.id}/views`);
      this.message = '已按新的出生资料重算这张盘';
      return true;
    } catch (error) {
      this.error = errorMessage(error);
      return false;
    } finally {
      this.pending = false;
    }
  }

  async patch(data: object): Promise<void> {
    if (!this.chart) return;
    this.error = '';
    try {
      this.chart = await patchChart(this.chart.id, { revision: this.chart.revision, ...data });
      this.menu = false;
      this.menuMode = '';
      this.message = '已更新';
    } catch (error) {
      this.error = errorMessage(error);
    }
  }

  async saveView(): Promise<ViewChartSnapshot | null> {
    if (!this.preview || this.pending || this._inFlight || !this.chart) return null;
    this._inFlight = true;
    const chartId = this.chart.id;
    const version = this._requestVersion;
    this.pending = true;
    try {
      const view = await saveChartView(chartId, this.preview.previewToken, crypto.randomUUID());
      if (version !== this._requestVersion || chartId !== this.chart?.id) return null;
      this.views.setItems([view, ...this.views.items.filter((item) => item.id !== view.id)]);
      this.saved = view;
      this.preview = null;
      this.message = '当前视图已保存，可以在这里写笔记';
      return view;
    } catch (error) {
      if (version === this._requestVersion) this.error = errorMessage(error);
      return null;
    } finally {
      this._inFlight = false;
      if (version === this._requestVersion) this.pending = false;
    }
  }

  viewLabel(view: ViewChartSnapshot): string {
    const query = view.query;
    if (query.mode === 'decadal') {
      const decade = view.result.decadal;
      return decade ? `${decade.range[0]}–${decade.range[1]} 虚岁 · ${decade.fromYear}–${decade.toYear}` : `${query.startAge} 虚岁起大限`;
    }
    if (query.mode === 'day') return query.date;
    if (query.mode === 'months') return `${query.startMonth} 起 ${query.count} 个月`;
    if (query.mode === 'decades') return '当前 / 下一大限';
    return '流年区间';
  }
}
