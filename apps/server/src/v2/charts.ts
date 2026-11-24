import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { ZIWEI_RULES, type ZiweiInput, type ChartRecord, type ChartRecordSummary, type ChartSnapshot, type BaseChartSnapshot, type ViewChartSnapshot, type ViewPreview, type ZiweiQuery,type ListPage } from '@dongxuan/dto';
import { createNatal, createView, createFlowOptions, ENGINE_META, renderLegacy } from '../domain/ziwei/index.js';
import { getPool } from '../db/index.js';
import { AppError } from '../errors.js';
import { transaction, owned, iso, optionalIso, json, type Row } from './store.js';
import {listPage} from './pagination.js';
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const snapshotRecord = (r: Row): ChartSnapshot => ({ id: r.id, chartId: r.chart_id, kind: r.kind, baseSnapshotId: r.base_snapshot_id, input: r.input, rules: r.rules, engineMeta: r.engine_meta, schemaVersion: r.schema_version, query: r.query, result: r.result, text: r.text, provenance: r.provenance, createdAt: iso(r.created_at) });
export function chartSummary(r: Row, summary: Row = {}): ChartRecordSummary { return { id: r.id, title: r.title, calendar: r.calendar, date: r.date_str, timeIndex: r.time_index, timeName: summary.time || '', gender: r.gender, lunarDate: summary.lunarDate || '', fiveElementsClass: summary.fiveElementsClass || '', createdAt: iso(r.created_at), ...(r.relation ? { relation: r.relation } : {}), ...(r.remark ? { remark: r.remark } : {}), system: 'ziwei', archivedAt: optionalIso(r.archived_at), updatedAt: iso(r.updated_at), revision: r.revision, migrationStatus: r.migration_status === 'ready' ? 'ready' : 'failed', ...(r.migration_error ? { migrationError: r.migration_error } : {}) }; }
export async function readChart(userId: string, id: string, db: Pick<pg.PoolClient, 'query'> = getPool()): Promise<ChartRecord> { const r = await owned('charts', userId, id, db); const s = await db.query("SELECT * FROM chart_snapshots WHERE chart_id=$1 AND user_id=$2 AND kind='base'", [id, userId]); return { ...chartSummary(r, s.rows[0]?.summary), sourceChartId: r.source_chart_id, baseSnapshot: s.rows[0] ? snapshotRecord(s.rows[0]) as BaseChartSnapshot : null }; }
export function listChartRecords(userId: string, search?: string): Promise<ChartRecordSummary[]>;
export function listChartRecords(userId: string, search: string | undefined, pagination: { rawQuery: unknown; archived?: 'true' | 'false' }): Promise<ChartRecordSummary[] | ListPage<ChartRecordSummary>>;
export async function listChartRecords(userId: string, search?: string, pagination?: { rawQuery: unknown; archived?: 'true' | 'false' }): Promise<ChartRecordSummary[] | ListPage<ChartRecordSummary>> { const archived = pagination?.archived ?? null; return listPage(pagination?.rawQuery ?? {}, { userId, scope: 'charts', filters: { search: search || null, archived }, sql: `SELECT c.*,s.summary FROM charts c LEFT JOIN chart_snapshots s ON s.chart_id=c.id AND s.kind='base' WHERE c.user_id=$1 AND ($2::text IS NULL OR c.title ILIKE '%'||$2||'%' OR coalesce(c.relation,'') ILIKE '%'||$2||'%') AND ($3::boolean IS NULL OR (c.archived_at IS NOT NULL)=$3)`, values: [userId, search || null, archived] }, r => chartSummary(r, r.summary ?? {})); }
export async function createChartRecord(userId: string, input: ZiweiInput, key?: string): Promise<ChartRecord> { const fingerprint = hash(input); if (key && key.length > 128)
    throw AppError.of(400, 'VALIDATION', '幂等键过长'); return transaction(async (db) => { if (key) {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId + key]);
    const previous = await db.query('SELECT * FROM operation_keys WHERE user_id=$1 AND scope=$2 AND key=$3', [userId, 'chart', key]);
    if (previous.rows[0]) {
        if (previous.rows[0].fingerprint !== fingerprint)
            throw AppError.of(409, 'CONFLICT', '同一幂等键不能用于不同输入');
        return readChart(userId, previous.rows[0].resource_id, db);
    }
} const result = createNatal(input); const r = await db.query("INSERT INTO charts(user_id,title,calendar,date_str,time_index,gender,is_leap_month,migration_status) VALUES($1,$2,$3,$4,$5,$6,$7,'ready') RETURNING *", [userId, input.title, input.calendar, input.date, input.timeIndex, input.gender, input.isLeapMonth ?? false]); const chart = r.rows[0]; await db.query("INSERT INTO chart_snapshots(chart_id,user_id,kind,input,rules,engine_meta,result,text,summary,provenance) VALUES($1,$2,'base',$3,$4,$5,$6,$7,$8,'系统计算')", [chart.id, userId, json(input), json(result.rules), json(result.engineMeta), json(result), result.text, json({ time: result.time, lunarDate: result.lunarDate, fiveElementsClass: result.fiveElementsClass })]); if (key)
    await db.query('INSERT INTO operation_keys(user_id,scope,key,resource_id,fingerprint) VALUES($1,$2,$3,$4,$5)', [userId, 'chart', key, chart.id, fingerprint]); return readChart(userId, chart.id, db); }); }
export async function backfillLegacy(): Promise<{
    total: number;
    ready: number;
    failed: number;
}> { return transaction(async (db) => { await db.query('LOCK TABLE charts IN SHARE ROW EXCLUSIVE MODE'); const rows = await db.query("SELECT c.* FROM charts c WHERE NOT EXISTS(SELECT 1 FROM chart_snapshots s WHERE s.chart_id=c.id AND s.kind='base') ORDER BY c.created_at,c.id"); for (const r of rows.rows) {
    const input: ZiweiInput = { title: r.title, calendar: r.calendar, date: r.date_str, timeIndex: r.time_index, gender: r.gender, isLeapMonth: r.is_leap_month, system: 'ziwei' };
    try {
        const legacy = renderLegacy(input);
        const meta = { ...ENGINE_META, calendarVersion: 'not-recorded', adapterVersion: 'legacy-rebuilt-v1', textVersion: 'legacy-v1', referenceSha256: 'fce1a62c44ae70126d4b16240261e7d26273a283940a644dac56fbbf788ef2a8' };
        const result = { ...legacy, solarPillars: '', pillarPrecision: '旧版未保存节气四柱', birthSolarDate: legacy.solarDate, rules: ZIWEI_RULES, engineMeta: meta };
        await db.query("INSERT INTO chart_snapshots(chart_id,user_id,kind,input,rules,engine_meta,result,text,summary,provenance) VALUES($1,$2,'base',$3,$4,$5,$6,$7,$8,'迁移时按既有逻辑重建，并非创建当日历史结果') ON CONFLICT DO NOTHING", [r.id, r.user_id, json(input), json(ZIWEI_RULES), json(meta), json(result), legacy.text, json({ time: legacy.time, lunarDate: legacy.lunarDate, fiveElementsClass: legacy.fiveElementsClass })]);
        await db.query("UPDATE charts SET migration_status='ready',migration_error=NULL WHERE id=$1", [r.id]);
    }
    catch (e) {
        await db.query("UPDATE charts SET migration_status='failed',migration_error=$2 WHERE id=$1", [r.id, e instanceof Error ? e.message : '旧盘重建失败']);
    }
} const counts = await db.query("SELECT count(*)::int total,count(*) FILTER(WHERE migration_status='ready')::int ready,count(*) FILTER(WHERE migration_status<>'ready')::int failed FROM charts"); return counts.rows[0]; }); }
type Pending = {
    userId: string;
    chartId: string;
    baseId: string;
    inputHash: string;
    expires: number;
    result: ReturnType<typeof createView>;
    fingerprint: string;
};
export async function replaceChartInput(userId: string, chartId: string, input: ZiweiInput): Promise<ChartRecord> {
    return transaction(async (db) => {
        await owned('charts', userId, chartId, db);
        const noted = await db.query("SELECT 1 FROM notes WHERE user_id=$1 AND snapshot_id IN (SELECT id FROM chart_snapshots WHERE chart_id=$2 AND user_id=$1 AND kind='view') LIMIT 1", [userId, chartId]);
        if (noted.rowCount) throw AppError.of(409, 'REFERENCED', '已保存的运限上还有笔记，先处理笔记再改正出生资料');
        const stored: ZiweiInput = { ...input, system: 'ziwei' };
        const result = createNatal(stored);
        await db.query("DELETE FROM chart_snapshots WHERE chart_id=$1 AND user_id=$2 AND kind='view'", [chartId, userId]);
        await db.query('UPDATE charts SET title=$3,calendar=$4,date_str=$5,time_index=$6,gender=$7,is_leap_month=$8,revision=revision+1,updated_at=now() WHERE id=$1 AND user_id=$2', [chartId, userId, input.title, input.calendar, input.date, input.timeIndex, input.gender, input.isLeapMonth ?? false]);
        const base = await db.query("UPDATE chart_snapshots SET input=$3,rules=$4,engine_meta=$5,result=$6,text=$7,summary=$8,provenance=$9 WHERE chart_id=$1 AND user_id=$2 AND kind='base' RETURNING id", [chartId, userId, json(stored), json(result.rules), json(result.engineMeta), json(result), result.text, json({ time: result.time, lunarDate: result.lunarDate, fiveElementsClass: result.fiveElementsClass }), '改正出生资料后重算']);
        if (!base.rows[0]) throw AppError.of(409, 'INCOMPLETE', '旧盘尚未重建成功');
        return readChart(userId, chartId, db);
    });
}
const pending = new Map<string, Pending>();
export async function chartFlowOptions(userId: string, chartId: string, request: { date?: string; year?: number }) {
    const chart = await readChart(userId, chartId), base = chart.baseSnapshot;
    if (!base) throw AppError.of(409, 'INCOMPLETE', '旧盘尚未重建成功');
    assertEngine(base);
    return createFlowOptions(base.input, request);
}
export async function previewView(userId: string, chartId: string, query: ZiweiQuery): Promise<ViewPreview> { const chart = await readChart(userId, chartId), base = chart.baseSnapshot; if (!base)
    throw AppError.of(409, 'INCOMPLETE', '旧盘尚未重建成功'); assertEngine(base); const result = createView(base.input, query), inputHash = hash(base.input), fingerprint = hash({ baseId: base.id, inputHash, query, result }); for (const [k, p] of pending)
    if (p.expires < Date.now())
        pending.delete(k); if (pending.size > 1000)
    throw AppError.of(429, 'LIMIT', '预览过多，请稍后再试'); const token = randomUUID(), expires = Date.now() + 15 * 60 * 1000; pending.set(token, { userId, chartId, baseId: base.id, inputHash, expires, result, fingerprint }); return { previewToken: token, query, result, text: result.text, expiresAt: new Date(expires).toISOString(), fingerprint }; }
export function assertEngine(base: Pick<ChartSnapshot, 'engineMeta'>) { if ((Object.keys(ENGINE_META) as Array<keyof typeof ENGINE_META>).some(key => base.engineMeta[key] !== ENGINE_META[key]))
    throw AppError.of(409, 'ENGINE_CHANGED', '这张盘是旧引擎结果，只能阅读，不能再排运限'); }
export async function saveView(userId: string, chartId: string, token: string, title?: string, key?: string): Promise<ViewChartSnapshot> { const p = pending.get(token); if (!p || p.userId !== userId || p.chartId !== chartId || p.expires < Date.now())
    throw AppError.of(409, 'PREVIEW_EXPIRED', '预览已过期或不属于当前盘，请重新预览'); return transaction(async (db) => { const c = await readChart(userId, chartId, db); if (c.baseSnapshot?.id !== p.baseId || hash(c.baseSnapshot.input) !== p.inputHash)
    throw AppError.of(409, 'CONFLICT', '基础盘已变化，请重新预览'); assertEngine(c.baseSnapshot); const opKey = key || token; await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId + opKey]); const prev = await db.query('SELECT * FROM operation_keys WHERE user_id=$1 AND scope=$2 AND key=$3', [userId, 'view', opKey]); if (prev.rows[0]) {
    if (prev.rows[0].fingerprint !== p.fingerprint)
        throw AppError.of(409, 'CONFLICT', '幂等键已用于另一视图');
    return snapshotRecord(await owned('chart_snapshots', userId, prev.rows[0].resource_id, db)) as ViewChartSnapshot;
} const r = await db.query("INSERT INTO chart_snapshots(chart_id,user_id,kind,base_snapshot_id,input,rules,engine_meta,query,result,text,summary,provenance,view_title) VALUES($1,$2,'view',$3,$4,$5,$6,$7,$8,$9,$10,'已验证的服务端预览',$11) RETURNING *", [chartId, userId, p.baseId, json(c.baseSnapshot.input), json(c.baseSnapshot.rules), json(p.result.engineMeta), json(p.result.query), json(p.result), p.result.text, json({ title: title || '运限视图' }), title || null]); await db.query('INSERT INTO operation_keys(user_id,scope,key,resource_id,fingerprint) VALUES($1,$2,$3,$4,$5)', [userId, 'view', opKey, r.rows[0].id, p.fingerprint]); return snapshotRecord(r.rows[0]) as ViewChartSnapshot; }); }
