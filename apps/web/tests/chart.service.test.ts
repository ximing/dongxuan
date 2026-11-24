import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { ChartRecord, HoroscopeLayer, ViewChartSnapshot, ViewPreview, ZiweiFlowOptions, ZiweiQuery } from '@dongxuan/dto';
import { ChartService } from '../src/pages/chart/chart.service';

const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const chart = { id: 'chart-one', title: '合成盘' } as ChartRecord;
const options: ZiweiFlowOptions = {
  asOfDate: '2026-11-24', currentAge: 34, currentStartAge: 26, defaultStartAge: 26,
  decades: [{ startAge: 26, range: [26, 35], fromYear: 2018, toYear: 2027, palaceName: '命宫', heavenlyStem: '甲', earthlyBranch: '子' }],
  date: '2026-11-24', year: 2026, yearDate: '2026-02-17', years: [2025, 2026],
  months: [{ id: 'month-a', label: '十月', month: 10, isLeapMonth: false, part: 'normal', from: '2026-11-09', to: '2026-12-08' }, { id: 'month-b', label: '冬月', month: 11, isLeapMonth: false, part: 'normal', from: '2026-12-09', to: '2027-01-07' }],
  minDate: '1993-03-01', maxDate: '2099-12-31',
};
const preview = (query: ZiweiQuery, token = 'preview') => ({ previewToken: token, result: { query, text: token, segments: [], views: {} } }) as ViewPreview;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function service() { const s = new ChartService(); s.chart = chart; s.flowOptions = structuredClone(options); s.selectedStartAge = 26; s.date = options.date; return s; }
const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = async () => { throw new Error('Unexpected request'); }; });
afterEach(() => { globalThis.fetch = originalFetch; });

test('selects native decades directly and uses day queries only for the requested flow level', async () => {
  const s = service(), queries: ZiweiQuery[] = [];
  globalThis.fetch = async (_url, init) => { const query = JSON.parse(String(init?.body)); queries.push(query); return json(preview(query)); };
  s.level = 'decadal'; await s.selectDecade('36');
  assert.deepEqual(queries.at(-1), { mode: 'decadal', startAge: 36 });
  s.level = 'monthly'; await s.selectMonth('month-b');
  assert.deepEqual(queries.at(-1), { mode: 'day', date: '2026-12-09', includeDaily: false, level: 'monthly' });
  s.level = 'daily'; await s.calculateCurrent();
  assert.deepEqual(queries.at(-1), { mode: 'day', date: '2026-12-09', includeDaily: true, level: 'daily' });
  s.level = 'decadal'; await s.selectDecade('childhood');
  assert.deepEqual(queries.at(-1), { mode: 'day', date: options.asOfDate, includeDaily: false, level: 'decadal' });
});

test('year selection uses the engine Spring Festival anchor and newer metadata wins', async () => {
  const s = service(), first = deferred<Response>(), queries: ZiweiQuery[] = [];
  s.level = 'yearly';
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('year=2025')) return first.promise;
    if (String(url).includes('flow-options')) return json({ ...options, date: '2026-11-24' });
    const query = JSON.parse(String(init?.body)); queries.push(query); return json(preview(query));
  };
  const old = s.selectYear('2025');
  await s.selectYear('2026');
  first.resolve(json({ ...options, year: 2025, yearDate: '2025-01-29', date: '2025-01-29' }));
  await old;
  assert.equal(s.flowOptions?.year, 2026);
  assert.deepEqual(queries, [{ mode: 'day', date: '2026-02-17', includeDaily: false, level: 'yearly' }]);
});

test('rapid changes keep the newest response and its loading state', async () => {
  const s = service(), first = deferred<Response>(), second = deferred<Response>(); let requests = 0;
  globalThis.fetch = async () => ++requests === 1 ? first.promise : second.promise;
  const one = s.calculate({ mode: 'decadal', startAge: 26 });
  const two = s.calculate({ mode: 'decadal', startAge: 36 });
  first.resolve(json(preview({ mode: 'decadal', startAge: 26 }, 'old'))); await one;
  assert.equal(s.pending, true); assert.equal(s.preview, null);
  second.resolve(json(preview({ mode: 'decadal', startAge: 36 }, 'new'))); await two;
  assert.equal(s.pending, false); assert.equal(s.preview?.previewToken, 'new');
});

test('a response for another chart never replaces the active chart preview', async () => {
  const s = service(), pending = deferred<Response>();
  globalThis.fetch = async () => pending.promise;
  const request = s.calculate({ mode: 'decadal', startAge: 26 });
  s.chart = { ...chart, id: 'chart-two' };
  pending.resolve(json(preview({ mode: 'decadal', startAge: 26 })));
  await request; assert.equal(s.preview, null);
});

test('reopens the exact saved decade without applying the current default', async () => {
  const s = service();
  const saved = { id: 'snapshot', chartId: chart.id, query: { mode: 'decadal', startAge: 116 }, result: { text: 'frozen', decadal: { range: [116, 125], fromYear: 2108, toYear: 2117 } } } as ViewChartSnapshot;
  globalThis.fetch = async url => String(url).includes('flow-options') ? json(options) : json(saved);
  await s.loadSaved(chart.id, saved.id); await s.loadFlowOptions();
  assert.equal(s.selectedStartAge, 116); assert.equal(s.level, 'decadal');
  assert.equal(s.text, 'frozen'); assert.equal(s.flowHeading, '116–125 虚岁 · 2108–2117');
});

test('refreshing a saved childhood view retains its original date even after adulthood', async () => {
  const s = service(), queries: ZiweiQuery[] = [];
  const query: ZiweiQuery = { mode: 'day', date: '1993-04-01', includeDaily: false, level: 'decadal' };
  const saved = { id: 'childhood', chartId: chart.id, query, result: { day: { decadal: { name: '童限' } } } } as ViewChartSnapshot;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('flow-options')) return json({ ...options, date: query.date });
    if (String(url).includes('snapshots')) return json(saved);
    const q = JSON.parse(String(init?.body)); queries.push(q); return json(preview(q));
  };
  await s.loadSaved(chart.id, saved.id); await s.calculateCurrent();
  assert.equal(s.selectedStartAge, null);
  assert.deepEqual(queries, [query]);
});

test('opening a saved view cancels an earlier year selection before it can replace the binding', async () => {
  const s = service(), metadata = deferred<Response>();
  const saved = { id: 'saved', chartId: chart.id, query: { mode: 'decadal', startAge: 116 }, result: { text: 'saved' } } as ViewChartSnapshot;
  s.level = 'yearly';
  globalThis.fetch = async url => {
    if (String(url).includes('flow-options')) return metadata.promise;
    if (String(url).includes('snapshots')) return json(saved);
    throw Error('An obsolete selection must not calculate');
  };
  const selection = s.selectYear('2025');
  await s.loadSaved(chart.id, saved.id);
  metadata.resolve(json({ ...options, year: 2025 }));
  await selection;
  assert.equal(s.saved?.id, 'saved');
  assert.equal(s.preview, null);
  assert.equal(s.level, 'decadal');
});

function dayPreview(level: 'yearly' | 'monthly' | 'daily', date = '2026-11-24'): ViewPreview {
  const layer = (name: string, index: number): HoroscopeLayer => ({ name, index, heavenlyStem: '甲', earthlyBranch: '子', palaceNames: Array.from({ length: 12 }, (_, i) => `宫${i}`), stars: Array.from({ length: 12 }, () => []), mutagen: ['禄', '权', '科', '忌'] });
  const result = preview({ mode: 'day', date, includeDaily: level === 'daily', level }, `${level}-${date}`);
  result.result.day = { date, nominalAge: 34, text: result.result.text, decadal: layer('大限', 1), yearly: layer('流年', 2), age: layer('小限', 3), monthly: layer('流月', 4), daily: layer('流日', 5) };
  return result;
}

test('switching flow levels retains the complete previous view until the new result arrives', async () => {
  const s = service(), response = deferred<Response>();
  s.level = 'yearly'; s.preview = dayPreview('yearly');
  const oldLayer = s.flowLayer, oldText = s.text;
  globalThis.fetch = async () => response.promise;
  s.setLevel('monthly');
  assert.equal(s.level, 'monthly');
  assert.equal(s.displayLevel, 'yearly');
  assert.equal(s.flowLayer, oldLayer);
  assert.equal(s.text, oldText);
  assert.equal(s.layers.length, 2);
  assert.equal(s.preview, null);
  assert.equal(s.viewUpdating, true);
  assert.equal(s.viewActionsDisabled, true);
  assert.equal(await s.saveView(), null);
  response.resolve(json(dayPreview('monthly')));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.displayLevel, 'monthly');
  assert.equal(s.flowLayer?.name, '流月');
  assert.equal(s.layers.length, 3);
  assert.equal(s.staleView, false);
  assert.equal(s.viewActionsDisabled, false);
});

test('year metadata and preview requests share one retained display without a loading gap', async () => {
  const s = service(), metadata = deferred<Response>(), result = deferred<Response>();
  s.level = 'yearly'; s.preview = dayPreview('yearly');
  const oldText = s.text;
  globalThis.fetch = async url => String(url).includes('flow-options') ? metadata.promise : result.promise;
  const selection = s.selectYear('2025');
  assert.equal(s.text, oldText);
  assert.equal(s.viewUpdating, true);
  metadata.resolve(json({ ...options, year: 2025, yearDate: '2025-01-29', date: '2025-01-29' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.text, oldText);
  assert.equal(s.viewUpdating, true);
  result.resolve(json(dayPreview('yearly', '2025-01-29'))); await selection;
  assert.equal(s.activeDay?.date, '2025-01-29');
  assert.equal(s.viewUpdating, false);
});

test('a failed update retains the previous display but cannot copy or save it as the new selection', async () => {
  const s = service(); s.level = 'monthly'; s.preview = dayPreview('monthly');
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: '模拟计算失败' } }), { status: 503 });
  await s.selectMonth('month-b');
  assert.equal(s.text, 'monthly-2026-11-24');
  assert.equal(s.flowLayer?.name, '流月');
  assert.equal(s.staleView, true);
  assert.equal(s.viewUpdating, false);
  assert.equal(s.viewActionsDisabled, true);
  assert.equal(await s.saveView(), null);
  assert.ok(s.error);
});

test('returning to natal clears the retained overlay and rejects a late flow response', async () => {
  const s = service(), response = deferred<Response>();
  s.level = 'yearly'; s.preview = dayPreview('yearly');
  globalThis.fetch = async () => response.promise;
  const selection = s.selectYear('2025');
  s.setLevel('natal');
  assert.equal(s.flowLayer, undefined);
  assert.equal(s.retainedView, null);
  response.resolve(json({ ...options, year: 2025 })); await selection;
  assert.equal(s.viewResult, undefined);
  assert.equal(s.level, 'natal');
});

test('opening a saved view keeps the current display while the snapshot is loading', async () => {
  const s = service(), response = deferred<Response>();
  s.level = 'monthly'; s.preview = dayPreview('monthly');
  const saved = { id: 'saved-decade', chartId: chart.id, query: { mode: 'decadal', startAge: 26 }, result: preview({ mode: 'decadal', startAge: 26 }).result } as ViewChartSnapshot;
  globalThis.fetch = async () => response.promise;
  const loading = s.loadSaved(chart.id, saved.id);
  assert.equal(s.text, 'monthly-2026-11-24');
  assert.equal(s.viewUpdating, true);
  assert.equal(s.viewActionsDisabled, true);
  response.resolve(json(saved)); await loading;
  assert.equal(s.saved?.id, saved.id);
  assert.equal(s.snapshotLoading, false);
  assert.equal(s.viewActionsDisabled, false);
});
