import { Service } from '@rabjs/react';
import type { BirthProfile, ChartRecord, HoroscopeLayer, ViewChartSnapshot, ViewPreview, ZiweiDayResult, ZiweiQuery } from '@dongxuan/dto';
import { getChart, getSnapshot, patchChart, previewChartView, reviseChart, saveChartView } from '@/api/charts';
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
  _requestVersion = 0;
  _inFlight = false;
  _openVersion = 0;
  _savedVersion = 0;

  get base() {
    return this.chart?.baseSnapshot ?? null;
  }

  get viewResult() {
    return this.saved?.result || this.preview?.result;
  }

  get activeDay(): ZiweiDayResult | undefined {
    const result = this.viewResult;
    if (!result) return undefined;
    if (result.day) return result.day;
    const viewId = this.segmentId || result.segments[0]?.viewId;
    return viewId ? result.views[viewId] : undefined;
  }

  get layers(): HoroscopeLayer[] {
    const day = this.activeDay;
    if (!day) return [];
    return [day.decadal, day.yearly, day.monthly, day.daily].filter((layer): layer is HoroscopeLayer => Boolean(layer));
  }

  get flowLayer(): HoroscopeLayer | undefined {
    if (this.level === 'natal') return undefined;
    return this.dayLayer(this.level);
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
    } catch (error) {
      if (version === this._openVersion) this.error = errorMessage(error);
    }
  }

  cancelOpen(): void {
    this._openVersion += 1;
    this.views.cancel();
  }

  async loadSaved(chartId: string | undefined, snapshotId: string | null): Promise<void> {
    const version = ++this._savedVersion;
    if (!snapshotId) {
      this.saved = null;
      return;
    }
    try {
      const saved = await getSnapshot(snapshotId);
      if (version !== this._savedVersion) return;
      if (saved.chartId !== chartId) throw new Error('保存视图不属于当前命盘');
      this.saved = saved;
      this.preview = null;
      if (saved.query.mode === 'day') {
        this.date = saved.query.date;
        this.level = saved.query.level;
        this.tab = 'board';
      } else if (saved.query.mode === 'months') {
        this.start = saved.query.startMonth;
        this.count = saved.query.count;
        this.tab = 'months';
      }
    } catch (error) {
      if (version === this._savedVersion) this.error = errorMessage(error);
    }
  }

  cancelSaved(): void {
    this._savedVersion += 1;
  }

  invalidate(): void {
    this._requestVersion += 1;
    this.preview = null;
    this.saved = null;
    this.message = '';
    this.segmentId = '';
  }

  setLevel(level: ChartLevel): void {
    this.level = level;
  }

  setTab(tab: string): void {
    this.tab = tab;
  }

  setDatePart(part: number, value: string): void {
    const pieces = this.date.split('-');
    pieces[part] = value;
    const year = Number(pieces[0]);
    const month = Number(pieces[1]);
    pieces[2] = String(Math.min(Number(pieces[2]), new Date(year, month, 0).getDate())).padStart(2, '0');
    this.date = pieces.join('-');
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
    this._inFlight = true;
    const version = ++this._requestVersion;
    this.pending = true;
    this.error = '';
    this.message = '';
    try {
      const next = await previewChartView(this.chart.id, query);
      if (version !== this._requestVersion) return;
      this.preview = next;
      this.saved = null;
      this.segmentId = '';
    } catch (error) {
      if (version === this._requestVersion) this.error = errorMessage(error);
    } finally {
      this._inFlight = false;
      this.pending = false;
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
    if (!this.preview || this._inFlight || !this.chart) return null;
    this._inFlight = true;
    const version = this._requestVersion;
    this.pending = true;
    try {
      const view = await saveChartView(this.chart.id, this.preview.previewToken, crypto.randomUUID());
      this.views.setItems([view, ...this.views.items.filter((item) => item.id !== view.id)]);
      if (version !== this._requestVersion) return null;
      this.saved = view;
      this.preview = null;
      this.message = '当前视图已保存，可以在这里写笔记';
      return view;
    } catch (error) {
      this.error = errorMessage(error);
      return null;
    } finally {
      this._inFlight = false;
      this.pending = false;
    }
  }

  viewLabel(view: ViewChartSnapshot): string {
    const query = view.query;
    if (query.mode === 'day') return query.date;
    if (query.mode === 'months') return `${query.startMonth} 起 ${query.count} 个月`;
    if (query.mode === 'decades') return '当前 / 下一大限';
    return '流年区间';
  }
}
