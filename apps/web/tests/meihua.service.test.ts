import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { MeihuaDraft } from '@dongxuan/dto';
import { MeihuaService } from '../src/pages/meihua/meihua.service';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const legacy = { id: 'draft', question: '旧问题', numberA: 1, numberB: 2, revision: 1, status: 'raw', createdAt: '2020-01-01T12:00:00Z', updatedAt: '' } as MeihuaDraft;

test('new requests default to a complete time while old drafts never use their creation timestamp', async () => {
  const s = new MeihuaService(); assert.ok(s.castingTime);
  s.openDraft(legacy);
  assert.equal(s.castingDate, ''); assert.equal(s.castingHour, ''); assert.equal(s.castingTime, null);
  let submitted: any;
  globalThis.fetch = async (_url, init) => { submitted = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ ...legacy, castingTime: submitted.castingTime, revision: 2 })); };
  await s.save();
  assert.equal(submitted.castingTime, null);
  s.useCurrentCastingTime(); assert.ok(s.castingTime);
});

test('editing preserves the actual late-zi date and rejects a partially selected time before saving', async () => {
  const s = new MeihuaService();
  s.openDraft({ ...legacy, castingTime: { date: '2026-11-25', timeIndex: 12, timeZone: 'Asia/Shanghai' } });
  let requests = 0, submitted: any;
  globalThis.fetch = async (_url, init) => { requests++; submitted = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ ...legacy, castingTime: submitted.castingTime })); };
  s.setCastingHour(''); await s.save();
  assert.equal(requests, 0); assert.match(s.error, /完整选择/);
  s.setCastingHour('12'); await s.save();
  assert.deepEqual(submitted.castingTime, { date: '2026-11-25', timeIndex: 12, timeZone: 'Asia/Shanghai' });
});
