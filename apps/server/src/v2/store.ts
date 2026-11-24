import type pg from 'pg';
import { getPool } from '../db/index.js';
import { AppError } from '../errors.js';
export type Row = Record<string, any>;
export const iso = (value: any): string => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
export const optionalIso = (v: any): string | null => v ? iso(v) : null;
export async function transaction<T>(fn: (db: pg.PoolClient) => Promise<T>): Promise<T> { const db = await getPool().connect(); try {
    await db.query('BEGIN');
    await db.query("SET LOCAL dongxuan.snapshot_writer = 'v2'");
    const value = await fn(db);
    await db.query('COMMIT');
    return value;
}
catch (e) {
    await db.query('ROLLBACK');
    throw e;
}
finally {
    db.release();
} }
export async function owned(table: string, userId: string, id: string, db: Pick<pg.PoolClient, 'query'> = getPool()): Promise<Row> { const r = await db.query(`SELECT * FROM ${table} WHERE id=$1 AND user_id=$2`, [id, userId]); if (!r.rows[0])
    throw AppError.of(404, 'NOT_FOUND', '没有找到这份资料'); return r.rows[0]; }
export function revision(row: Row, value: number) { if (row.revision !== value)
    throw AppError.of(409, 'CONFLICT', '资料已在其他页面修改，请刷新后重试'); }
export function refConflict(e: unknown): never { if (e && typeof e === 'object' && 'code' in e && e.code === '23503')
    throw AppError.of(409, 'REFERENCED', '资料仍被命盘或笔记引用，请先解除关联，或使用归档'); throw e; }
export const json = (v: unknown) => JSON.stringify(v);
