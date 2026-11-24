import { Service } from '@rabjs/react';
import type { ChartRecordSummary } from '@dongxuan/dto';
import { PagedList } from '@/lib/paged-list';

export class ChartsService extends Service {
  charts = new PagedList<ChartRecordSummary>();
  search = '';
  filter = 'all';

  get path(): string {
    return `/api/v2/charts?search=${encodeURIComponent(this.search)}&archived=${this.filter === 'archived'}`;
  }

  load(): void {
    this.charts.reload(this.path);
  }

  setSearch(value: string): void {
    this.search = value;
    this.charts.reload(this.path);
  }

  setFilter(value: string): void {
    this.filter = value;
    this.charts.reload(this.path);
  }
}
