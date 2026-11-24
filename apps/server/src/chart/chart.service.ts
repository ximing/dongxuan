/** v1 compatibility: every read uses persisted snapshots, never the live renderer. */
import type { ChartInput, ChartSummary, ChartView } from '@dongxuan/dto';
import { createChartRecord, listChartRecords, readChart } from '../v2/charts.js';
import { owned, transaction, refConflict } from '../v2/store.js';
import { AppError } from '../errors.js';
export async function createChart(userId: string, input: ChartInput): Promise<ChartView> { const c = await createChartRecord(userId, { ...input, system: 'ziwei' }); if (!c.baseSnapshot)
    throw AppError.of(500, 'INCOMPLETE'); return { ...c.baseSnapshot.result, title: c.title, id: c.id, createdAt: c.createdAt }; }
export async function listCharts(userId: string): Promise<ChartSummary[]> { return listChartRecords(userId); }
export async function getChart(userId: string, id: string): Promise<ChartView> { const c = await readChart(userId, id); if (!c.baseSnapshot)
    throw AppError.of(409, 'INCOMPLETE', c.migrationError || '旧盘重建失败，请保留原始输入后重新排盘'); return { ...c.baseSnapshot.result, title: c.title, id: c.id, createdAt: c.createdAt }; }
export async function deleteChart(userId: string, id: string): Promise<void> { try {
    await transaction(async (db) => { await owned('charts', userId, id, db); const refs = await db.query('SELECT 1 FROM notes WHERE chart_id=$1 OR snapshot_id IN(SELECT id FROM chart_snapshots WHERE chart_id=$1) LIMIT 1', [id]); if (refs.rowCount)
        throw AppError.of(409, 'REFERENCED', '盘上还有笔记，请先处理笔记或归档'); await db.query("DELETE FROM chart_snapshots WHERE chart_id=$1 AND user_id=$2 AND kind='view'", [id, userId]); await db.query('DELETE FROM chart_snapshots WHERE chart_id=$1 AND user_id=$2', [id, userId]); await db.query('DELETE FROM charts WHERE id=$1 AND user_id=$2', [id, userId]); });
}
catch (e) {
    refConflict(e);
} }
