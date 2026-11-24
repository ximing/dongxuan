import { Service } from '@rabjs/react';
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
  active: MeihuaDraft | null = null;
  pending = false;
  error = '';
  message = '';
  _inFlight = false;

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
    this.message = '';
  }

  openDraft(draft: MeihuaDraft): void {
    this.active = draft;
    this.question = draft.question;
    this.numberA = String(draft.numberA);
    this.numberB = String(draft.numberB);
    this.chartId = draft.chartId || '';
    this.message = '';
  }

  async save(): Promise<MeihuaDraft | null> {
    if (this._inFlight) return null;
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
