import { Service } from '@rabjs/react';
import { castingTimeFromFields, currentCastingTime } from '@dongxuan/dto';
import type { ChartRecordSummary, MeihuaDraft } from '@dongxuan/dto';
import { listAllCharts } from '@/api/charts';
import { deleteMeihuaDraft, saveMeihuaDraft } from '@/api/meihua';
import { errorMessage } from '@/lib/format';
import { PagedList } from '@/lib/paged-list';
import { DialogService } from '@/services/dialog.service';

export class MeihuaService extends Service {
  charts: ChartRecordSummary[] = [];
  drafts = new PagedList<MeihuaDraft>();
  question = '';
  numberA = '';
  numberB = '';
  chartId = '';
  castingDate = '';
  castingHour = '';
  active: MeihuaDraft | null = null;
  pending = false;
  error = '';
  message = '';
  _inFlight = false;

  constructor() { super(); const time = currentCastingTime(); this.castingDate = time.date; this.castingHour = String(time.timeIndex); }
  get castingTime() { return castingTimeFromFields(this.castingDate, this.castingHour); }
  setCastingDate(value: string): void { this.castingDate = value; this.message = ''; }
  setCastingHour(value: string): void { this.castingHour = value; this.message = ''; }
  useCurrentCastingTime(): void { const time = currentCastingTime(); this.castingDate = time.date; this.castingHour = String(time.timeIndex); this.message = ''; }

  get dialog(): DialogService {
    return this.resolve(DialogService);
  }

  async loadCharts(): Promise<void> {
    try {
      this.charts = await listAllCharts();
    } catch (error) {
      this.error = errorMessage(error);
    }
  }

  setQuestion(value: string): void {
    this.question = value;
    this.message = '';
  }

  setNumberA(value: string): void {
    this.numberA = value;
    this.message = '';
  }

  setNumberB(value: string): void {
    this.numberB = value;
    this.message = '';
  }

  setChart(value: string): void {
    this.chartId = value;
    this.question = '';
    this.numberA = '';
    this.numberB = '';
    this.active = null;
    this.useCurrentCastingTime();
    this.message = '';
  }

  openDraft(draft: MeihuaDraft): void {
    this.active = draft;
    this.question = draft.question;
    this.numberA = String(draft.numberA);
    this.numberB = String(draft.numberB);
    this.chartId = draft.chartId || '';
    this.castingDate = draft.castingTime?.date || '';
    this.castingHour = draft.castingTime ? String(draft.castingTime.timeIndex) : '';
    this.message = '';
  }

  async save(): Promise<MeihuaDraft | null> {
    if (this._inFlight) return null;
    if ((this.castingDate || this.castingHour) && !this.castingTime) { this.error = '请完整选择有效的起卦日期和时辰，或清空两项。'; return null; }
    if (!this.question.trim() || this.numberA === '' || this.numberB === '' || !Number.isSafeInteger(Number(this.numberA)) || !Number.isSafeInteger(Number(this.numberB))) {
      this.error = '请填写问题和安全范围内的两个整数。';
      return null;
    }
    this._inFlight = true;
    this.pending = true;
    this.error = '';
    try {
      const draft = await saveMeihuaDraft(this.active?.id ?? null, {
        question: this.question,
        numberA: Number(this.numberA),
        numberB: Number(this.numberB),
        chartId: this.chartId || null,
        castingTime: this.castingTime,
        ...(this.active ? { revision: this.active.revision } : {}),
      });
      this.drafts.setItems([draft, ...this.drafts.items.filter((item) => item.id !== draft.id)]);
      this.active = draft;
      this.message = '原始资料已保存，尚未起卦。';
      return draft;
    } catch (error) {
      this.error = errorMessage(error);
      return null;
    } finally {
      this._inFlight = false;
      this.pending = false;
    }
  }

  async remove(draft: MeihuaDraft): Promise<void> {
    if (!await this.dialog.confirm('删除这份原始草稿？')) return;
    try {
      await deleteMeihuaDraft(draft.id, draft.revision);
      this.drafts.setItems(this.drafts.items.filter((item) => item.id !== draft.id));
      if (this.active?.id === draft.id) {
        this.active = null;
        this.message = '';
      }
    } catch (error) {
      this.error = errorMessage(error);
    }
  }
}
