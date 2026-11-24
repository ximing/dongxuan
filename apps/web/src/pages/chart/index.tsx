import { bindServices, observer, useService } from '@rabjs/react';
import { useEffect, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { BirthFields } from '@/components/birth-fields';
import { CopyButton, ErrorBanner } from '@/components/chrome';
import { Notes } from '@/components/notes';
import { Pagination } from '@/components/pagination';
import { Button, ButtonLink, DatePicker, Input, MonthPicker, Select, Textarea } from '@/components/ui';
import { Board } from './board';
import { ChartService, type ChartLevel } from './chart.service';

const LEVELS: ReadonlyArray<readonly [ChartLevel, string]> = [
  ['natal', '本命'],
  ['decadal', '大限'],
  ['yearly', '流年'],
  ['monthly', '流月'],
  ['daily', '流日'],
];

const TABS = [
  ['board', '宫位盘'],
  ['text', '文字盘'],
  ['months', '月份区间'],
  ['views', '已保存视图'],
  ['notes', '随手记'],
] as const;

const ChartContent = observer(function ChartContent() {
  const service = useService(ChartService);
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const menuRef = useRef<HTMLDivElement>(null);
  const chart = service.chart;
  const base = service.base;
  const result = service.viewResult;
  const options = service.flowOptions;

  useEffect(() => {
    if (!id) return;
    void service.open(id);
    return () => service.cancelOpen();
  }, [service, id]);

  useEffect(() => {
    void service.loadSaved(id, params.get('snapshot'));
    return () => service.cancelSaved();
  }, [service, id, params]);

  useEffect(() => {
    document.body.classList.toggle('focus-mode', service.focus);
    return () => document.body.classList.remove('focus-mode');
  }, [service, service.focus]);

  useEffect(() => {
    if (!service.menu) return;
    return service.bindMenu(menuRef.current);
  }, [service, service.menu]);

  function clearSnapshot() {
    if (params.has('snapshot')) setParams({});
  }

  function invalidate() {
    service.invalidate(true);
    clearSnapshot();
  }

  async function saveCurrent() {
    const view = await service.saveView();
    if (view) setParams({ snapshot: view.id });
  }

  if (!chart || !base) {
    return (
      <main>
        <ErrorBanner error={service.error} />
        <p className="loading">{chart && !base ? '旧盘尚未完成迁移，请联系管理员修复。' : service.error ? '命盘没有打开' : '正在读取命盘…'}</p>
        <Link to="/charts">返回命盘列表</Link>
      </main>
    );
  }

  const viewStatus = (
    <div className="flow-status" role="status" aria-live="polite" aria-atomic="true">
      <span className={`flow-status-indicator ${service.viewUpdating ? 'is-updating' : ''}`} aria-hidden="true" />
      <span>{service.viewUpdating ? (service.staleView ? '正在更新，暂时显示上次结果…' : '正在更新盘面…') : service.savingView ? '正在保存当前视图…' : service.staleView ? '当前为上次结果，请更新盘面后再复制或保存。' : service.message || (service.tab === 'board' || service.tab === 'text' ? service.selectionNote : service.tab === 'months' ? '按实际流月拆段，跨阳历月保留重复引用。' : '')}</span>
    </div>
  );

  return (
    <main aria-busy={service.viewUpdating}>
      {service.focus ? <Button variant="default" className="focus-exit" onClick={() => service.setFocus(false)}>退出专注</Button> : null}
      <Link className="back-link" to="/charts">‹ 全部命盘</Link>
      <div className="page-heading chart-heading">
        <div>
          <h1>{chart.title}</h1>
          <p>{[chart.relation, `${chart.gender} · ${chart.date} · ${chart.timeName}`, chart.archivedAt ? '已归档' : ''].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="actions">
          <CopyButton text={service.text} label="复制文字盘" disabled={service.viewActionsDisabled} />
          <ButtonLink variant="default" size="sm" aria-disabled={service.viewActionsDisabled} onClick={event => { if (service.viewActionsDisabled) event.preventDefault(); }} to={`/prompts?chart=${chart.id}&date=${service.date}&start=${service.start}&count=${service.count}${service.saved ? `&snapshot=${service.saved.id}` : ''}`}>提示词</ButtonLink>
          <Button variant="default" size="sm" onClick={() => service.toggleFocus()}>{service.focus ? '退出专注' : '专注看盘'}</Button>
          <Button variant="primary" size="sm" disabled={!service.preview || service.viewActionsDisabled} onClick={() => void saveCurrent()}>存下这页</Button>
          <div className="chart-menu" ref={menuRef}>
            <Button variant="default" size="sm" aria-expanded={service.menu} aria-haspopup="menu" onClick={() => service.toggleMenu()}>更多 ▾</Button>
            {service.menu ? (
              <div role="menu" className="chart-menu-panel">
                <Button role="menuitem" onClick={() => service.setMenuMode('rename')}>修改称呼</Button>
                <Button role="menuitem" onClick={() => service.setMenuMode('birth')}>改正出生资料</Button>
                <Button role="menuitem" onClick={() => void service.patch({ archived: !chart.archivedAt })}>{chart.archivedAt ? '恢复命盘' : '归档命盘'}</Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <ErrorBanner error={service.error} />
      {service.menuMode === 'rename' ? (
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); void service.patch({ title: service.newTitle, relation: service.newRelation.trim() || null, remark: service.newRemark.trim() || null }); }}>
          <h2>修改称呼</h2>
          <label className="field">称呼<Input autoFocus required maxLength={64} value={service.newTitle} onChange={(event) => service.setNewTitle(event.target.value)} /></label>
          <label className="field">关系<Input maxLength={32} value={service.newRelation} onChange={(event) => service.setNewRelation(event.target.value)} placeholder="自己、家人、朋友" /></label>
          <label className="field">备注<Textarea maxLength={10000} value={service.newRemark} onChange={(event) => service.setNewRemark(event.target.value)} placeholder="只留在这张盘上，不进入提示词。" /></label>
          <div className="actions">
            <Button variant="default" type="button" onClick={() => service.setMenuMode('')}>取消</Button>
            <Button type="submit" variant="primary">保存</Button>
          </div>
        </form>
      ) : null}
      {service.menuMode === 'birth' ? (
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); void service.reviseBirth().then((ok) => { if (ok) setParams({}); }); }}>
          <h2>改正出生资料</h2>
          <p className="field-note">重算这一张盘。还没写笔记的运限会清掉；运限上已有笔记时，先处理笔记。</p>
          <BirthFields value={service.birthDraft} onChange={(value) => service.setBirthDraft(value)} required />
          <div className="actions">
            <Button variant="default" type="button" onClick={() => service.setMenuMode('')}>取消</Button>
            <Button type="submit" variant="primary" disabled={service.pending}>{service.pending ? '重算中…' : '重算这张盘'}</Button>
          </div>
        </form>
      ) : null}
      <div className="chart-top-tabs">
        {TABS.map(([value, label]) => <Button key={value} data-value={value} className={service.tab === value ? 'active' : ''} onClick={() => service.setTab(value)}>{label}</Button>)}
      </div>
      {service.tab !== 'board' && service.tab !== 'text' ? viewStatus : null}
      {service.tab === 'board' || service.tab === 'text' ? (
        <>
          <section className="chart-workspace-toolbar" aria-label="运限选择">
            <div className="chart-tools">
              <div className="chart-layer-tabs" role="group" aria-label="盘面层级">
                {LEVELS.map(([value, label]) => (
                  <Button key={value} className={service.level === value ? 'active' : ''} aria-pressed={service.level === value} disabled={service.savingView} onClick={() => { clearSnapshot(); service.setLevel(value); }}>{label}</Button>
                ))}
              </div>
              {service.level !== 'natal' && options ? (
                <div className="layer-controls flow-controls">
                  {service.level === 'decadal' ? (
                    <label className="decade-control"><span className="flow-control-label">大限区间</span>
                      <Select aria-label="大限区间" disabled={service.savingView} value={service.selectedStartAge == null ? 'childhood' : service.selectedStartAge} onValueChange={(value) => { clearSnapshot(); void service.selectDecade(value); }} options={[
                        ...(service.childhoodDate || (options.currentAge >= 1 && options.currentAge < options.decades[0].startAge) ? [{ value: 'childhood', label: service.childhoodDate ? `童限 · ${service.childhoodDate}` : `当前童限 · ${options.currentAge} 虚岁` }] : []),
                        ...options.decades.map(period => ({ value: period.startAge, label: `${period.range[0]}–${period.range[1]} 虚岁 · ${period.fromYear}–${period.toYear}${period.startAge === options.currentStartAge ? '（当前）' : ''}` })),
                      ]} />
                    </label>
                  ) : service.level === 'daily' ? (
                    <label><span className="flow-control-label">阳历日期</span>
                      <DatePicker aria-label="流日日期" required disabled={service.savingView} value={service.date} min={options.minDate} max={options.maxDate} onValueChange={(value) => { clearSnapshot(); void service.selectDate(value); }} />
                    </label>
                  ) : (
                    <>
                      <label className="year-control"><span className="flow-control-label">农历年</span>
                        <Select aria-label="流年年份" disabled={service.savingView} value={options.year} onValueChange={(value) => { clearSnapshot(); void service.selectYear(value); }} options={options.years.map(year => ({ value: year, label: `${year} 年` }))} />
                      </label>
                      {service.level === 'monthly' ? (
                        <label className="month-control"><span className="flow-control-label">流月</span>
                          <Select aria-label="流月月份" disabled={service.periodsLoading || service.savingView} value={service.selectedMonth?.id ?? ''} onValueChange={(value) => { clearSnapshot(); void service.selectMonth(value); }} options={options.months.map(month => ({ value: month.id, label: month.label }))} />
                        </label>
                      ) : null}
                    </>
                  )}
                  <Button variant="default" size="sm" className="flow-refresh" aria-label="更新盘面" title="更新盘面" disabled={service.pending || service.periodsLoading} onClick={() => void service.calculateCurrent()}><svg className="flow-refresh-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 11.6-1.6L20 8M4 16l2.4 2.6A7 7 0 0 0 18 17"/></svg></Button>
                </div>
              ) : <div className="flow-controls flow-controls-empty"><span className="rule-label">{service.level === 'natal' ? '本命十二宫' : '正在读取可选范围…'}</span></div>}
            </div>
            {viewStatus}
          </section>
          {service.periodsError ? <p className="view-query-note" role="alert">{service.periodsError} <Button size="sm" onClick={() => void service.loadFlowOptions().then(() => service.calculateCurrent())}>重试</Button></p> : null}
          {service.tab === 'board' ? (
            <div className="chart-layout">
              <div><Board chart={base.result} layer={service.flowLayer} title={chart.title} /></div>
              <aside className="chart-side">
                <section className="panel">
                  <h2>排盘资料</h2>
                  <dl className="detail-list">
                    <div><dt>库内四柱</dt><dd>{base.result.chineseDate}</dd></div>
                    <div><dt>节气四柱 · 时辰取样</dt><dd>{base.result.solarPillars}</dd></div>
                    <div><dt>命主 / 身主</dt><dd>{base.result.soul} / {base.result.body}</dd></div>
                    <div><dt>来源</dt><dd>{base.provenance}</dd></div>
                  </dl>
                </section>
                {service.layers.length ? (
                  <section className="panel">
                    <h2>{service.flowHeading}</h2>
                    {service.layers.map((layer) => (
                      <div className="flow-context" key={layer.name}>
                        <strong>{layer.name} {layer.heavenlyStem}{layer.earthlyBranch}</strong>
                        <p>{layer.mutagen.map((star, index) => `${star}化${['禄', '权', '科', '忌'][index]}`).join('、')}</p>
                      </div>
                    ))}
                  </section>
                ) : null}
                {chart.remark ? <section className="panel"><h2>备注</h2><p className="field-note">{chart.remark}</p></section> : null}
                <p className="snapshot-source">iztro {base.engineMeta.engineVersion}<br />{base.result.pillarPrecision}<br />出生资料记在这张盘上。改正后会重算这一张。</p>
              </aside>
            </div>
          ) : (
            <section className="text-sheet">
              <div className="text-top"><div><h2>文字盘</h2><p>{result?.decadal ? service.flowHeading : result ? '定位日期完整叠盘' : '本命十二宫'}</p></div><CopyButton text={service.text} disabled={service.viewActionsDisabled} /></div>
              <pre>{service.text}</pre>
            </section>
          )}
        </>
      ) : null}
      {service.tab === 'months' ? (
        <>
          <div className="panel">
            <div className="layer-controls">
              <label>起始阳历月<MonthPicker value={service.start} onValueChange={(value) => { service.setStart(value); invalidate(); }} /></label>
              <label>连续
                <Select value={service.count} onValueChange={(value) => { service.setCount(Number(value)); invalidate(); }} options={Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: `${index + 1} 个月` }))} />
              </label>
              <Button variant="primary" disabled={service.pending} onClick={() => void service.calculate({ mode: 'months', startMonth: service.start, count: service.count })}>查看月份区间</Button>
            </div>
            <p className="view-query-note">按实际流月拆段，跨阳历月保留重复引用；春节、大限及年龄变化分别标明。</p>
          </div>
          {result?.query.mode === 'months' ? (
            <>
              <div className="periods-strip" style={{ marginTop: 16 }}>
                {result.segments.map((segment) => (
                  <Button key={segment.id} className={`period-segment ${(service.segmentId || result.segments[0]?.viewId) === segment.viewId ? 'active' : ''}`} onClick={() => service.setSegment(segment.viewId)}>
                    <span className="date">{segment.from} 至 {segment.to}</span>
                    <strong>{segment.lunarLabel}</strong>
                    <small>{segment.nominalAge} 虚岁{segment.repeated ? ' · 引用同一流月' : ''}</small>
                  </Button>
                ))}
              </div>
              <Board chart={base.result} layer={service.activeDay?.monthly} title={chart.title} />
              <section className="text-sheet section-space">
                <div className="section-head"><h2>完整月份文字盘</h2><CopyButton text={service.text} disabled={service.viewActionsDisabled} /></div>
                <pre>{service.text}</pre>
              </section>
            </>
          ) : null}
        </>
      ) : null}
      {service.tab === 'views' ? (
        <section className="saved-views">
          {service.views.items.map((view) => (
            <article className="saved-view" key={view.id}>
              <strong className="small">{service.viewLabel(view)}</strong>
              <small>{new Date(view.createdAt).toLocaleString('zh-CN')}</small>
              <Button variant="default" size="sm" onClick={() => setParams({ snapshot: view.id })}>打开保存视图</Button>
            </article>
          ))}
          <Pagination loading={service.views.loading} hasMore={service.views.hasMore} error={service.views.error} count={service.views.items.length} onMore={() => void service.views.loadMore()} onRetry={() => service.views.reload()} />
          {service.views.loaded && !service.views.error && !service.views.items.length ? <p className="field-note">查看运限后，点击“存下这页”保留准确盘面。</p> : null}
        </section>
      ) : null}
      {service.tab === 'notes' ? (
        <>
          {service.preview && !service.saved ? <p className="field-note">当前运限尚未保存。下面的笔记记在这张命盘上；要记在这份运限上，先存下这页。</p> : null}
          {service.saved ? <Notes snapshotId={service.saved.id} /> : <Notes chartId={chart.id} />}
        </>
      ) : null}
    </main>
  );
});

export const ChartPage = bindServices(ChartContent, [ChartService]);
