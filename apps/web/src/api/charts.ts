import type { ChartRecord, ChartRecordSummary, ViewChartSnapshot, ViewPreview, ZiweiQuery } from '@dongxuan/dto';
import { api, apiAll } from './client';

export function listAllCharts(): Promise<ChartRecordSummary[]> {
  return apiAll<ChartRecordSummary>('/api/v2/charts');
}

export function getChart(id: string): Promise<ChartRecord> {
  return api<ChartRecord>(`/api/v2/charts/${id}`);
}

export function createChart(body: object, idempotencyKey: string): Promise<ChartRecord> {
  return api<ChartRecord>('/api/v2/charts', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
}

export function reviseChart(id: string, body: object): Promise<ChartRecord> {
  return api<ChartRecord>(`/api/v2/charts/${id}/revisions`, { method: 'POST', body: JSON.stringify(body) });
}

export function patchChart(id: string, data: object): Promise<ChartRecord> {
  return api<ChartRecord>(`/api/v2/charts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function previewChartView(id: string, query: ZiweiQuery): Promise<ViewPreview> {
  return api<ViewPreview>(`/api/v2/charts/${id}/views/preview`, { method: 'POST', body: JSON.stringify(query) });
}

export function saveChartView(id: string, previewToken: string, idempotencyKey: string): Promise<ViewChartSnapshot> {
  return api<ViewChartSnapshot>(`/api/v2/charts/${id}/views`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ previewToken }),
  });
}

export function getSnapshot(id: string): Promise<ViewChartSnapshot> {
  return api<ViewChartSnapshot>(`/api/v2/snapshots/${id}`);
}
