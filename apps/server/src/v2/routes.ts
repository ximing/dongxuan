import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ziweiInputSchema, chartPatchSchema, ziweiQuerySchema, viewSaveSchema, noteInputSchema, notePatchSchema, promptTemplateInputSchema, promptPreviewInputSchema, meihuaDraftInputSchema, PROMPT_TEMPLATE_REQUEST_BYTES, PROMPT_PREVIEW_REQUEST_BYTES } from '@dongxuan/dto';
import { authenticate, requireUser } from '../auth/authenticate.js';
import { getPool } from '../db/index.js';
import { AppError } from '../errors.js';
import { ZIWEI_CAPABILITY } from '../domain/ziwei/index.js';
import { transaction, owned, revision, json, refConflict } from './store.js';
import { noteRecord, templateRecord, meihuaRecord } from './records.js';
import { createChartRecord, listChartRecords, readChart, replaceChartInput, previewView, saveView, snapshotRecord, chartFlowOptions } from './charts.js';
import { ensureSeeds, buildPrompt } from './prompts.js';
import { VARIABLES, templateChecks } from './prompt-engine.js';
import {listPage} from './pagination.js';
const idSchema = z.object({ id: z.string().uuid() });
const params = (req: {
    params: unknown;
}) => idSchema.parse(req.params).id;
const querySchema = z.object({chartId:z.string().uuid().optional(),snapshotId:z.string().uuid().optional(),search:z.string().trim().max(100).optional(),archived:z.enum(['true','false']).optional(),system:z.enum(['ziwei','meihua']).optional()});
const options = { preHandler: [authenticate] };
export function registerV2Routes(app: FastifyInstance) {
    app.get('/api/v2/systems', options, async () => [ZIWEI_CAPABILITY, { id: 'meihua', name: '梅花易数', status: 'input_only', calculation: false }, { id: 'bazi', name: '八字', status: 'planned', calculation: false }, { id: 'qimen', name: '奇门遁甲', status: 'planned', calculation: false }]);
    app.get('/api/v2/charts',options,async(req)=>{const q=querySchema.parse(req.query);return listChartRecords(requireUser(req).id,q.search,{rawQuery:req.query,archived:q.archived});});
    app.post('/api/v2/charts', options, async (req, reply) => reply.code(201).send(await createChartRecord(requireUser(req).id, ziweiInputSchema.parse(req.body), String(req.headers['idempotency-key'] || '') || undefined)));
    app.get('/api/v2/charts/:id', options, async (req) => readChart(requireUser(req).id, params(req)));
    app.get('/api/v2/charts/:id/flow-options', options, async (req) => chartFlowOptions(requireUser(req).id, params(req), z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), year: z.coerce.number().int().min(1900).max(2099).optional() }).parse(req.query)));
    app.patch('/api/v2/charts/:id', options, async (req) => { const t = chartPatchSchema.parse(req.body), u = requireUser(req).id, id = params(req); return transaction(async (db) => { const r = await owned('charts', u, id, db); revision(r, t.revision); const next = await db.query('UPDATE charts SET title=$3,relation=$4,remark=$5,archived_at=$6,revision=revision+1,updated_at=now() WHERE id=$1 AND user_id=$2 AND revision=$7 RETURNING id', [id, u, t.title ?? r.title, t.relation === undefined ? r.relation : t.relation || null, t.remark === undefined ? r.remark : t.remark || null, t.archived === undefined ? r.archived_at : t.archived ? new Date() : null, t.revision]); if (!next.rows[0])
        throw AppError.of(409, 'CONFLICT', '命盘已更新，请刷新'); return readChart(u, id, db); }); });
    app.delete('/api/v2/charts/:id', options, async (req, reply) => { const u = requireUser(req).id, id = params(req); try {
        await transaction(async (db) => { await owned('charts', u, id, db); const refs = await db.query('SELECT 1 FROM notes WHERE user_id=$1 AND (chart_id=$2 OR snapshot_id IN(SELECT id FROM chart_snapshots WHERE chart_id=$2)) LIMIT 1', [u, id]); if (refs.rowCount)
            throw AppError.of(409, 'REFERENCED', '盘上还有笔记，请先处理笔记或归档'); await db.query('DELETE FROM chart_snapshots WHERE chart_id=$1 AND user_id=$2 AND kind=\'view\'', [id, u]); await db.query('DELETE FROM chart_snapshots WHERE chart_id=$1 AND user_id=$2', [id, u]); await db.query('DELETE FROM charts WHERE id=$1 AND user_id=$2', [id, u]); });
    }
    catch (e) {
        refConflict(e);
    } return reply.code(204).send(); });
    app.post('/api/v2/charts/:id/revisions', options, async (req) => replaceChartInput(requireUser(req).id, params(req), ziweiInputSchema.parse(req.body)));
    app.post('/api/v2/charts/:id/views/preview', options, async (req) => previewView(requireUser(req).id, params(req), ziweiQuerySchema.parse(req.body)));
    app.get('/api/v2/charts/:id/views',options,async(req)=>{const u=requireUser(req).id,id=params(req);await owned('charts',u,id);return listPage(req.query,{userId:u,scope:'chart-views:'+id,filters:{chartId:id},sql:`SELECT * FROM chart_snapshots WHERE chart_id=$1 AND user_id=$2 AND kind='view'`,values:[id,u]},snapshotRecord);});
    app.post('/api/v2/charts/:id/views', options, async (req, reply) => { const t = viewSaveSchema.parse(req.body); return reply.code(201).send(await saveView(requireUser(req).id, params(req), t.previewToken, t.title, String(req.headers['idempotency-key'] || '') || undefined)); });
    app.get('/api/v2/snapshots/:id', options, async (req) => snapshotRecord(await owned('chart_snapshots', requireUser(req).id, params(req))));
    app.get('/api/v2/notes',options,async(req)=>{const u=requireUser(req).id,q=querySchema.parse(req.query);if(q.chartId)await owned('charts',u,q.chartId);if(q.snapshotId)await owned('chart_snapshots',u,q.snapshotId);return listPage(req.query,{userId:u,scope:'notes',filters:{chartId:q.chartId??null,snapshotId:q.snapshotId??null},sql:'SELECT * FROM notes WHERE user_id=$1 AND ($2::uuid IS NULL OR chart_id=$2) AND ($3::uuid IS NULL OR snapshot_id=$3)',values:[u,q.chartId||null,q.snapshotId||null]},noteRecord);});
    app.post('/api/v2/notes', options, async (req, reply) => { const t = noteInputSchema.parse(req.body), u = requireUser(req).id; return reply.code(201).send(await transaction(async (db) => { if (t.chartId)
        await owned('charts', u, t.chartId, db); if (t.snapshotId)
        await owned('chart_snapshots', u, t.snapshotId, db); const r = await db.query('INSERT INTO notes(user_id,chart_id,snapshot_id,body) VALUES($1,$2,$3,$4) RETURNING *', [u, t.chartId ?? null, t.snapshotId ?? null, t.body]); return noteRecord(r.rows[0]); })); });
    app.patch('/api/v2/notes/:id', options, async (req) => { const t = notePatchSchema.parse(req.body), u = requireUser(req).id, id = params(req); return transaction(async (db) => { revision(await owned('notes', u, id, db), t.revision); const r = await db.query('UPDATE notes SET body=$3,revision=revision+1,updated_at=now() WHERE id=$1 AND user_id=$2 AND revision=$4 RETURNING *', [id, u, t.body, t.revision]); if (!r.rows[0])
        throw AppError.of(409, 'CONFLICT', '笔记已更新，请刷新'); return noteRecord(r.rows[0]); }); });
    app.delete('/api/v2/notes/:id', options, async (req, reply) => { const u = requireUser(req).id, id = params(req), q = z.object({ revision: z.coerce.number().int().positive() }).parse(req.query); await transaction(async (db) => { revision(await owned('notes', u, id, db), q.revision); const r = await db.query('DELETE FROM notes WHERE id=$1 AND user_id=$2 AND revision=$3', [id, u, q.revision]); if (!r.rowCount)
        throw AppError.of(409, 'CONFLICT', '笔记已更新，请刷新'); }); return reply.code(204).send(); });
    app.get('/api/v2/prompt-variables', options, async () => VARIABLES);
    app.get('/api/v2/prompt-templates',options,async(req)=>{const u=requireUser(req).id,q=querySchema.parse(req.query);await ensureSeeds(u);return listPage(req.query,{userId:u,scope:'prompt-templates',filters:{system:q.system??null,search:q.search||null},direction:'ASC',ranked:true,sql:`SELECT *,CASE seed_key WHEN 'action-months' THEN 0 WHEN 'decision-years' THEN 1 WHEN 'meihua-full' THEN 2 WHEN 'meihua-request' THEN 3 ELSE 4 END AS _sort_rank FROM prompt_templates WHERE user_id=$1 AND ($2::text IS NULL OR system=$2) AND ($3::text IS NULL OR title ILIKE '%'||$3||'%')`,values:[u,q.system??null,q.search||null]},templateRecord);});
    app.post('/api/v2/prompt-templates', { ...options, bodyLimit: PROMPT_TEMPLATE_REQUEST_BYTES }, async (req, reply) => { const t = promptTemplateInputSchema.parse(req.body), issues = templateChecks(t).issues; if (issues.length)
        throw AppError.of(400, 'VALIDATION', issues.join('\n')); const r = await getPool().query('INSERT INTO prompt_templates(user_id,system,title,body,inputs_schema,data_requirements,missing_policy) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [requireUser(req).id, t.system, t.title, json(t.bodyJson), json(t.inputsSchema), json(t.dataRequirements), t.missingPolicy ?? null]); return reply.code(201).send(templateRecord(r.rows[0])); });
    app.get('/api/v2/prompt-templates/:id', options, async (req) => templateRecord(await owned('prompt_templates', requireUser(req).id, params(req))));
    app.patch('/api/v2/prompt-templates/:id', { ...options, bodyLimit: PROMPT_TEMPLATE_REQUEST_BYTES }, async (req) => { const raw = z.object({ revision: z.number().int().positive() }).passthrough().superRefine((value, ctx) => {
        if ((value.body !== undefined) === (value.bodyJson !== undefined)) ctx.addIssue({ code: 'custom', message: 'bodyJson 与旧 body 必须且只能提供一个' });
    }).parse(req.body); const u = requireUser(req).id, id = params(req); return transaction(async (db) => {
        const stored = await owned('prompt_templates', u, id, db);
        revision(stored, raw.revision);
        if (raw.bodyJson === undefined) throw AppError.of(409, 'TEMPLATE_FORMAT_UPGRADED', '模板已升级为富文本，请刷新编辑器后再保存。');
        const t = promptTemplateInputSchema.parse(raw), issues = templateChecks(t).issues;
        if (issues.length) throw AppError.of(400, 'VALIDATION', issues.join('\n'));
        const r = await db.query('UPDATE prompt_templates SET title=$3,system=$4,body=$5,inputs_schema=$6,data_requirements=$7,missing_policy=$8,revision=revision+1,updated_at=now() WHERE id=$1 AND user_id=$2 AND revision=$9 RETURNING *', [id, u, t.title, t.system, json(t.bodyJson), json(t.inputsSchema), json(t.dataRequirements), t.missingPolicy ?? null, raw.revision]); if (!r.rows[0])
        throw AppError.of(409, 'CONFLICT', '模板已更新，请刷新'); return templateRecord(r.rows[0]); }); });
    app.delete('/api/v2/prompt-templates/:id', options, async (req, reply) => { const u = requireUser(req).id, id = params(req), q = z.object({ revision: z.coerce.number().int().positive() }).parse(req.query); await transaction(async (db) => { revision(await owned('prompt_templates', u, id, db), q.revision); const r = await db.query('DELETE FROM prompt_templates WHERE id=$1 AND user_id=$2 AND revision=$3', [id, u, q.revision]); if (!r.rowCount)
        throw AppError.of(409, 'CONFLICT', '模板已更新，请刷新'); }); return reply.code(204).send(); });
    app.post('/api/v2/prompt-previews', { ...options, bodyLimit: PROMPT_PREVIEW_REQUEST_BYTES }, async (req) => buildPrompt(requireUser(req).id, promptPreviewInputSchema.parse(req.body)));
    app.get('/api/v2/meihua-drafts',options,async(req)=>{const u=requireUser(req).id,q=querySchema.parse(req.query);if(q.chartId)await owned('charts',u,q.chartId);return listPage(req.query,{userId:u,scope:'meihua-drafts',filters:{chartId:q.chartId??null,search:q.search||null},sql:`SELECT * FROM meihua_drafts WHERE user_id=$1 AND ($2::uuid IS NULL OR chart_id=$2) AND ($3::text IS NULL OR question ILIKE '%'||$3||'%')`,values:[u,q.chartId??null,q.search||null]},meihuaRecord);});
    app.post('/api/v2/meihua-drafts', options, async (req, reply) => { const t = meihuaDraftInputSchema.parse(req.body), u = requireUser(req).id; return reply.code(201).send(await transaction(async (db) => { if (t.chartId)
        await owned('charts', u, t.chartId, db); const r = await db.query('INSERT INTO meihua_drafts(user_id,question,number_a,number_b,chart_id) VALUES($1,$2,$3,$4,$5) RETURNING *', [u, t.question, t.numberA, t.numberB, t.chartId ?? null]); return meihuaRecord(r.rows[0]); })); });
    app.get('/api/v2/meihua-drafts/:id', options, async (req) => meihuaRecord(await owned('meihua_drafts', requireUser(req).id, params(req))));
    app.patch('/api/v2/meihua-drafts/:id', options, async (req) => { const raw = z.object({ revision: z.number().int().positive() }).passthrough().parse(req.body), t = meihuaDraftInputSchema.parse(raw), u = requireUser(req).id, id = params(req); return transaction(async (db) => { revision(await owned('meihua_drafts', u, id, db), raw.revision); if (t.chartId)
        await owned('charts', u, t.chartId, db); const r = await db.query('UPDATE meihua_drafts SET question=$3,number_a=$4,number_b=$5,chart_id=$6,revision=revision+1,updated_at=now() WHERE id=$1 AND user_id=$2 AND revision=$7 RETURNING *', [id, u, t.question, t.numberA, t.numberB, t.chartId ?? null, raw.revision]); if (!r.rows[0])
        throw AppError.of(409, 'CONFLICT', '草稿已更新，请刷新'); return meihuaRecord(r.rows[0]); }); });
    app.delete('/api/v2/meihua-drafts/:id', options, async (req, reply) => { const u = requireUser(req).id, id = params(req), q = z.object({ revision: z.coerce.number().int().positive() }).parse(req.query); await transaction(async (db) => { revision(await owned('meihua_drafts', u, id, db), q.revision); const r = await db.query('DELETE FROM meihua_drafts WHERE id=$1 AND user_id=$2 AND revision=$3', [id, u, q.revision]); if (!r.rowCount)
        throw AppError.of(409, 'CONFLICT', '草稿已更新，请刷新'); }); return reply.code(204).send(); });
}
