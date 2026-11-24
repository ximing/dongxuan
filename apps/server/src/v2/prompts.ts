import { renderPromptDocument, type PromptPreviewInput, type PromptPreview, type PromptTemplateInput, type ZiweiQuery, type BaseChartSnapshot, type ViewChartSnapshot, type ZiweiViewResult } from '@dongxuan/dto';
import { createView, createCurrentDecade } from '../domain/ziwei/index.js';
import { AppError } from '../errors.js';
import { readChart, assertEngine, snapshotRecord } from './charts.js';
import { templateRecord } from './records.js';
import { owned, transaction, json } from './store.js';
import { PROMPT_SEEDS } from './prompt-seeds.js';
import { templateChecks, runtimeValues, fingerprint } from './prompt-engine.js';
export async function ensureSeeds(userId: string) { await transaction(async (db) => { await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId + 'prompt-seed']); const r = await db.query('SELECT 1 FROM prompt_seed_state WHERE user_id=$1', [userId]); if (r.rowCount)
    return; for (const t of PROMPT_SEEDS)
    await db.query('INSERT INTO prompt_templates(user_id,system,title,body,inputs_schema,data_requirements,missing_policy,seed_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,seed_key) DO NOTHING', [userId, t.system, t.title, json(t.bodyJson), json(t.inputsSchema), json(t.dataRequirements), t.missingPolicy ?? null, t.seedKey]); await db.query('INSERT INTO prompt_seed_state(user_id,seed_version) VALUES($1,2) ON CONFLICT DO NOTHING', [userId]); }); }
export async function buildPrompt(userId: string, input: PromptPreviewInput): Promise<PromptPreview> {
    let t: PromptTemplateInput | undefined = input.draft, revision: number | null = null;
    if (input.templateId) {
        const stored = templateRecord(await owned('prompt_templates', userId, input.templateId));
        if (input.revision !== undefined && input.revision !== stored.revision)
            throw AppError.of(409, 'CONFLICT', '模板已经修改，请刷新后重试');
        revision = stored.revision;
        t ??= stored;
    }
    if (!t)
        throw AppError.of(400, 'VALIDATION', '请选择模板或提交模板草稿');
    const checked = templateChecks(t), names = [...new Set([...checked.names, ...t.dataRequirements])], runtime = runtimeValues(t.inputsSchema, names, input.inputValues, input.question), diagnostics = [...checked.issues, ...runtime.issues], values = runtime.values, sources: string[] = [], coverage: PromptPreview['coverage'] = [];
    let base: BaseChartSnapshot | undefined, boundView: ViewChartSnapshot | undefined, chart: Awaited<ReturnType<typeof readChart>> | undefined;
    if (input.bindings.chartId) {
        chart = await readChart(userId, input.bindings.chartId);
        base = chart.baseSnapshot ?? undefined;
    }
    if (input.bindings.snapshotId) {
        const bound = snapshotRecord(await owned('chart_snapshots', userId, input.bindings.snapshotId));
        if (chart && bound.chartId !== chart.id)
            diagnostics.push('自动引用冲突：快照不属于所选命盘');
        chart ??= await readChart(userId, bound.chartId);
        base = chart.baseSnapshot ?? undefined;
        if (bound.kind === 'base')
            base = bound as BaseChartSnapshot;
        else {
            boundView = bound as ViewChartSnapshot;
            if (base && bound.baseSnapshotId !== base.id)
                diagnostics.push('自动引用冲突：已保存视图不属于当前基础快照');
            try {
                assertEngine(boundView);
            }
            catch (e) {
                diagnostics.push(e instanceof Error ? e.message : '已保存视图版本不可用');
            }
        }
    }
    const needZiwei = names.some(n => n.startsWith('ziwei.') || n === 'range.label' || n === 'years.label'), needTitle = names.includes('chart.title'), needZiweiSource = needZiwei || (needTitle && t.system === 'ziwei');
    if (needZiweiSource && !base)
        diagnostics.push('自动引用缺失：请选择有完整基础快照的紫微命盘');
    if (needTitle) {
        values['chart.title'] = t.system === 'ziwei' ? (chart?.title || '') : '';
        if (t.system === 'meihua')
            diagnostics.push('自动引用缺失：梅花卦例尚未计算，不能引用紫微盘名');
    }
    if (names.some(n => n.startsWith('profile.'))) {
        if (!chart)
            diagnostics.push('自动引用缺失：请选择命盘');
        else {
            values['profile.name'] = chart.title;
            values['profile.gender'] = chart.gender;
            sources.push('命盘：' + chart.title + '（称呼与性别）');
        }
    }
    if (input.bindings.meihuaDraftId)
        await owned('meihua_drafts', userId, input.bindings.meihuaDraftId);
    if (names.some(n => n.startsWith('meihua.')))
        diagnostics.push('自动引用缺失：梅花起卦规则与计算引擎未接入，两个数字不能代替真实卦象');
    if (names.some(n => n.startsWith('bazi.')))
        diagnostics.push('自动引用缺失：独立八字命盘尚未接入，不能用紫微四柱替代');
    if (boundView && needZiweiSource) {
        const q = boundView.query;
        const dateUsed = names.some(n => ['ziwei.current', 'ziwei.gender_age', 'ziwei.decade_current', 'ziwei.decades'].includes(n));
        if (q.mode === 'decadal' && dateUsed)
            diagnostics.push('自动引用冲突：所选保存视图是大限区间，不能代替基准日运限；请改用基础命盘取数');
        if ((q.mode === 'day' || q.mode === 'decades') && dateUsed && input.asOfDate && input.asOfDate !== (q.mode === 'day' ? q.date : q.asOfDate))
            diagnostics.push('自动引用冲突：已保存视图的基准日与本次参数不同，请清除视图绑定后重新取数');
        if (!needZiwei && needTitle)
            sources.push(`紫微命盘名称：${chart?.title}；命盘 ${chart?.id}`);
    }
    if (base && needTitle && !needZiwei && t.system === 'ziwei' && !boundView)
        sources.push(`紫微命盘名称：${chart?.title}；命盘 ${chart?.id}`);
    const cache = new Map<string, ZiweiViewResult>();
    const query = (q: ZiweiQuery): ZiweiViewResult => { if (!base)
        throw AppError.of(400, 'INCOMPLETE', '基础盘缺失'); assertEngine(base); const k = JSON.stringify(q); let r = cache.get(k); if (!r) {
        if (boundView?.query.mode === q.mode) {
            const saved = boundView.query;
            let matches = false;
            if (saved.mode === 'day' && q.mode === 'day')
                matches = saved.date === q.date;
            else if (saved.mode === 'months' && q.mode === 'months')
                matches = saved.startMonth === q.startMonth && saved.count === q.count;
            else if (saved.mode === 'years' && q.mode === 'years')
                matches = JSON.stringify([...new Set(saved.years)].sort()) === JSON.stringify([...new Set(q.years)].sort());
            else if (saved.mode === 'decades' && q.mode === 'decades')
                matches = saved.asOfDate === q.asOfDate;
            if (!matches)
                throw AppError.of(409, 'SOURCE_CONFLICT', '已保存视图的时间范围与本次参数不同，请清除视图绑定后重新取数');
            if (q.mode === 'day' && q.includeDaily && !boundView.result.day?.daily)
                throw AppError.of(409, 'INCOMPLETE', '已保存视图不含完整流日，请改用基础盘取数或选择完整流日视图');
            r = boundView.result;
            sources.push(`已保存视图 ${boundView.id}（${JSON.stringify(boundView.query)}），使用其原始结果`);
        }
        else {
            r = createView(base.input, q);
            if (boundView)
                sources.push(`基础快照派生的补充资料：${JSON.stringify(q)}；与绑定视图范围分别标识`);
        }
        cache.set(k, r);
    } return r; };
    if (base && needZiwei) {
        const natal = base.result;
        values['ziwei.natal'] = base.text;
        values['ziwei.birth'] = `出生输入 ${base.input.calendar === 'solar' ? '阳历' : '农历'} ${base.input.date}；${base.input.gender}；${natal.time} ${natal.timeRange}；晚子归次日；${natal.pillarPrecision}`;
        sources.push(`紫微：${chart?.title}；基础快照 ${base.id}；iztro ${base.engineMeta.engineVersion}；适配器 ${base.engineMeta.adapterVersion}`);
        const dateRequired = names.some(n => ['ziwei.current', 'ziwei.gender_age', 'ziwei.decade_current', 'ziwei.decades'].includes(n));
        if (dateRequired && !input.asOfDate)
            diagnostics.push('自动引用缺失：请选择基准日');
        if (dateRequired && input.asOfDate) {
            try {
                if (names.includes('ziwei.current') || names.includes('ziwei.gender_age')) {
                    const r = query({ mode: 'day', date: input.asOfDate, includeDaily: names.includes('ziwei.current'), level: names.includes('ziwei.current') ? 'daily' : 'monthly' });
                    values['ziwei.current'] = r.text;
                    values['ziwei.gender_age'] = `${base.input.gender}；${r.day?.nominalAge} 虚岁（基准日 ${input.asOfDate}，农历年口径；目标段以自身虚岁为准）`;
                }
                if (names.includes('ziwei.decades')) {
                    const r = query({ mode: 'decades', asOfDate: input.asOfDate });
                    if (!r.decades?.current || !r.decades.next)
                        throw Error('当前或下一大限不完整');
                    values['ziwei.decade_current'] = r.decades.current.text;
                    values['ziwei.decades'] = r.decades.current.text + '\n\n' + r.decades.next.text;
                }
                else if (names.includes('ziwei.decade_current')) {
                    assertEngine(base);
                    if (boundView?.query.mode === 'decades') {
                        const r = query({ mode: 'decades', asOfDate: input.asOfDate });
                        if (!r.decades?.current)
                            throw Error('已保存视图没有完整当前大限');
                        values['ziwei.decade_current'] = r.decades.current.text;
                    }
                    else {
                        values['ziwei.decade_current'] = createCurrentDecade(base.input, input.asOfDate).text;
                        if (boundView)
                            sources.push(`基础快照派生的补充资料：基准日 ${input.asOfDate} 当前大限`);
                    }
                }
            }
            catch (e) {
                diagnostics.push('计算资料不完整：' + (e instanceof Error ? e.message : '基准日运限失败'));
            }
        }
        if (names.includes('ziwei.months') || names.includes('range.label')) {
            if (!input.months)
                diagnostics.push('自动引用缺失：请选择连续阳历月份');
            else
                try {
                    const r = query({ mode: 'months', ...input.months });
                    values['ziwei.months'] = r.text;
                    values['range.label'] = `${input.months.startMonth} 起连续 ${input.months.count} 个阳历月（按实际流月拆段）`;
                    coverage.push(...r.segments.map(s => ({ from: s.from, to: s.to, label: s.lunarLabel })));
                }
                catch (e) {
                    diagnostics.push('计算资料不完整：' + (e instanceof Error ? e.message : '月份失败'));
                }
        }
        if (names.includes('ziwei.years') || names.includes('years.label')) {
            if (!input.years?.length)
                diagnostics.push('自动引用缺失：请选择目标流年');
            else
                try {
                    const r = query({ mode: 'years', years: input.years });
                    values['ziwei.years'] = r.text;
                    values['years.label'] = [...new Set(input.years)].sort().join('、') + ' 年（春节为界）';
                    coverage.push(...r.segments.map(s => ({ from: s.from, to: s.to, label: '流年 ' + s.lunarLabel })));
                }
                catch (e) {
                    diagnostics.push('计算资料不完整：' + (e instanceof Error ? e.message : '流年失败'));
                }
        }
    }
    for (const n of names)
        if (!Object.hasOwn(values, n) || !values[n]?.trim())
            if (!diagnostics.some(d => d.includes(n)))
                diagnostics.push('引用内容缺失：' + n);
    if (names.some(n => n.startsWith('input.') || n === 'question'))
        sources.push('用户本次填写');
    const unique = [...new Set(diagnostics)];
    if (unique.length)
        return { text: '', sources, coverage, fingerprint: fingerprint({ input, diagnostics: unique }), templateRevision: revision, diagnostics: unique };
    let text: string;
    try { text = renderPromptDocument(t.bodyJson, values, 200000); }
    catch (error) { return { text: '', sources, coverage, fingerprint: '', templateRevision: revision, diagnostics: [error instanceof Error ? error.message : '无法生成完整提示词'] }; }
    text += `\n\n---\n资料来源：${sources.join('；') || '模板固定文本'}。\n模板：${t.title}${input.draft ? '（草稿' + (revision ? '，基于 revision ' + revision : '') + '）' : revision ? ' · revision ' + revision : '（草稿）'}。不自动包含命盘备注和私人笔记。`;
    return { text, sources, coverage, fingerprint: fingerprint({ template: t, revision, input, baseId: base?.id, text }), templateRevision: revision, diagnostics: [] };
}
