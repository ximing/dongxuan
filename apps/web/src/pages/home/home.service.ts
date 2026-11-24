import { Service } from '@rabjs/react';
import type { BirthProfile, ChartRecordSummary } from '@dongxuan/dto';
import { createChart, listAllCharts } from '@/api/charts';
import { errorMessage } from '@/lib/format';

export class HomeService extends Service {
  charts: ChartRecordSummary[] = [];
  sourceLoading = true;
  title = '';
  birth: BirthProfile = { calendar: 'solar' };
  error = '';
  pending = false;
  _inFlight = false;

  async load(): Promise<void> {
    this.sourceLoading = true;
    try {
      this.charts = await listAllCharts();
    } catch (error) {
      this.error = errorMessage(error);
    } finally {
      this.sourceLoading = false;
    }
  }

  setTitle(value: string): void {
    this.title = value;
  }

  setBirth(value: BirthProfile): void {
    this.birth = value;
  }

  useExample(): void {
    this.title = '示例盘';
    this.birth = { calendar: 'solar', date: '1993-03-01', timeIndex: 8, gender: '男' };
  }

  async cast(): Promise<string | null> {
    if (this._inFlight) return null;
    this.error = '';
    if (this.birth.timeIndex === undefined || !this.birth.gender || !this.birth.date) {
      this.error = '请补齐出生日期、性别与时辰。';
      return null;
    }
    this._inFlight = true;
    this.pending = true;
    try {
      const chart = await createChart({
        ...this.birth,
        title: this.title,
        calendar: this.birth.calendar || 'solar',
        system: 'ziwei',
      }, crypto.randomUUID());
      return chart.id;
    } catch (error) {
      this.error = errorMessage(error);
      return null;
    } finally {
      this._inFlight = false;
      this.pending = false;
    }
  }
}
