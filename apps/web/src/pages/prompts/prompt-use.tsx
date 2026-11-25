import { CastingTimeFields } from '@/components/casting-time-fields';
import { observer, useService } from '@rabjs/react';
import { Button, DatePicker, Disclosure, Input, MonthPicker, Select, Textarea } from '@/components/ui';
import { describeTemplate } from './prompt-model';
import { PromptsService } from './prompts.service';

const placeholders: Record<string, string> = {
  action: '例如：想在未来三个月换工作，目前还在准备简历。',
  status: '可以写目前的状态、限制条件或已有准备。',
  option_a: '第一个现实选择，可以留空。',
  option_b: '第二个现实选择，可以留空。',
  option_c: '第三个现实选择，可以留空。',
  criteria: '例如：成长空间、收入稳定性、时间投入。',
  question: '写下这次想了解的具体问题。',
};
function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? <span className="prompt-field-error" id={id + '-error'}>{error}</span> : null;
}

export const PromptUse = observer(function PromptUse() {
  const service = useService(PromptsService);
  const errors = [...Object.values(service.fieldErrors), ...service.diagnostics, ...(service.runError ? [service.runError] : [])];
  const hasSources = service.needZiwei || service.needProfile || service.usesDate || service.usesMonths || service.usesYears || service.usesCastingTime;
  return <>
    <div className="prompt-mobile-tabs" aria-label="使用步骤">
      <Button className={service.mobileView === 'fill' ? 'active' : ''} aria-pressed={service.mobileView === 'fill'} onClick={() => service.setMobileView('fill')}>填写资料</Button>
      <Button className={service.mobileView === 'result' ? 'active' : ''} aria-pressed={service.mobileView === 'result'} onClick={() => service.setMobileView('result')}>查看结果{service.preview ? (service.previewStale ? ' · 待更新' : ' · 已就绪') : ''}</Button>
    </div>
    <div className="prompt-use-grid" data-mobile={service.mobileView}>
      <form className="prompt-fill-pane" noValidate onSubmit={event => { event.preventDefault(); void service.generate(true); }} aria-busy={service.generating}>
        <div className="prompt-template-heading">
          <div><h2>{service.usage.title}</h2><p>{describeTemplate(service.usage)}</p></div>
          <Button className={'prompt-favorite' + (service.favorites.includes(service.active || '') ? ' selected' : '')} aria-label={service.favorites.includes(service.active || '') ? '取消常用' : '设为常用'} aria-pressed={service.favorites.includes(service.active || '')} onClick={() => service.toggleFavorite()}>{service.favorites.includes(service.active || '') ? '★' : '☆'}</Button>
        </div>
        {hasSources ? <section className="prompt-source-section" aria-label="关联资料">
          <div className="prompt-section-heading"><h3>关联资料</h3><span>{service.usedSources.length ? service.usedSources.length + ' 类资料自动带入' : '按模板显示'}</span></div>
          {service.usesCastingTime ? <div className="prompt-range-field"><CastingTimeFields id="prompt-casting" date={service.castingDate} hour={service.castingHour} onDate={value => service.setCastingDate(value)} onHour={value => service.setCastingHour(value)} onNow={() => service.useCurrentCastingTime()} disabled={service.meihuaLoading} error={service.fieldErrors['prompt-casting-date'] || service.fieldErrors['prompt-casting-hour']} /></div> : null}
          {service.needZiwei || service.needProfile ? <>
            <label className="field" htmlFor="prompt-chart"><span>命盘</span>
              <Select id="prompt-chart" aria-invalid={Boolean(service.fieldErrors['prompt-chart'])} aria-describedby={service.fieldErrors['prompt-chart'] ? 'prompt-chart-error' : undefined} value={service.chartId} onValueChange={value => service.selectChart(value)} options={[
                { value: '', label: '请选择命盘' },
                ...(service.chartId && !service.charts.some(chart => chart.id === service.chartId) ? [{ value: service.chartId, label: '当前带入的命盘' }] : []),
                ...service.charts.map(chart => ({ value: chart.id, label: chart.title })),
              ]} />
              <FieldError id="prompt-chart" error={service.fieldErrors['prompt-chart']} />
            </label>
            {service.chartId ? <p className="prompt-chart-meta">↗ 已关联命盘，不包含私人笔记</p> : null}
            {service.sourcesError ? <div className="prompt-source-error" role="alert"><p>命盘列表读取失败：{service.sourcesError}</p><Button variant="default" size="sm" onClick={() => void service.loadCharts()}>重新读取</Button></div> : null}
          </> : null}
          {service.needZiwei && service.snapshotId ? <div className={'prompt-bound-source' + (service.sourceError ? ' warning' : '')} role="status">
            <p>{service.sourceLoading ? '正在读取保存视图…' : service.sourceSnapshot ? '来自保存视图：' + service.sourceLabel : '保存视图未能读取：' + (service.sourceError || '请重试或更换来源。')}</p>
            <div className="actions">
              {service.sourceError ? <Button size="sm" variant="default" onClick={() => void service.loadSnapshot(service.snapshotId, service.chartId || null)}>重试读取</Button> : null}
              <Button size="sm" variant="default" onClick={() => service.clearSnapshotBinding()}>改用基础命盘</Button>
            </div>
          </div> : null}
          {service.sourceNotice && service.needZiwei ? <p className="prompt-source-notice" role="status">{service.sourceNotice}</p> : null}
          {service.usesMonths ? <div className="prompt-range-field">
            <div className="field"><span>看哪段时间 <small className="muted">阳历</small></span>
              <div className="prompt-range-row">
                <MonthPicker id="prompt-month" aria-label="起始月份" aria-invalid={Boolean(service.fieldErrors['prompt-month'])} aria-describedby={service.fieldErrors['prompt-month'] ? 'prompt-month-error' : undefined} value={service.start} min="1901-01" max="2099-12" onValueChange={value => service.setStart(value)} />
                <Select aria-label="连续月份数" value={service.count} onValueChange={value => service.setCount(Number(value))} options={Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: '连续 ' + (index + 1) + ' 个月' }))} />
              </div>
              <FieldError id="prompt-month" error={service.fieldErrors['prompt-month']} />
              <span className="field-note">{service.rangeLabel ? service.rangeLabel + '，按实际流月分段。' : '请选择有效的月份范围。'}</span>
            </div>
          </div> : null}
          {service.usesYears ? <label className="field prompt-range-field" htmlFor="prompt-years"><span>对比哪些流年</span>
            <Input id="prompt-years" value={service.years} maxLength={128} placeholder="例如：2026, 2027, 2028" aria-invalid={Boolean(service.fieldErrors['prompt-years'])} aria-describedby="prompt-years-help prompt-years-error" onChange={event => service.setYears(event.target.value)} />
            <span className="field-note" id="prompt-years-help">春节为界；最多 12 个年份，以逗号分隔。</span>
            <FieldError id="prompt-years" error={service.fieldErrors['prompt-years']} />
          </label> : null}
          <Disclosure className="prompt-source-details" open={service.sourceDetailsOpen} onToggle={event => service.setSourceDetailsOpen(event.currentTarget.open)} summary={'已关联资料与时间设置' + (service.usesDate ? ' · 基准日 ' + service.asOf : '')}>
            <div className="prompt-source-chips">{service.usedSources.map(variable => <span key={variable.name}>{variable.label}</span>)}</div>
            {service.usesDate ? <label className="field" htmlFor="prompt-date"><span>基准日</span>
              <DatePicker id="prompt-date" value={service.asOf} min="1901-01-01" max="2099-12-31" aria-invalid={Boolean(service.fieldErrors['prompt-date'])} aria-describedby="prompt-date-help prompt-date-error" onValueChange={value => service.setAsOf(value)} />
              <span id="prompt-date-help" className="field-note">用于确定虚岁和当前大限，不改变目标月份或流年范围。</span>
              <FieldError id="prompt-date" error={service.fieldErrors['prompt-date']} />
            </label> : null}
          </Disclosure>
        </section> : null}
        {service.needMeihua ? <p className="prompt-unavailable">完整梅花卦象尚未接入。此模板暂时无法生成；如需提交问题和数字，可使用“梅花原始起卦请求”。</p> : null}
        {service.names.some(name => name.startsWith('bazi.')) ? <p className="prompt-unavailable">独立八字命盘尚未接入，此模板暂时无法生成。</p> : null}
        {service.meihua && service.usage.system === 'meihua' ? <p className="prompt-bound-source">已带入这次原始起卦请求：{service.meihua.question}（尚未起卦）。</p> : null}
        <section className="prompt-manual-section" aria-label="本次填写">
          <div className="prompt-section-heading"><h3>本次填写</h3></div>
          {service.usage.missingPolicy ? <p className="field-note prompt-missing-policy">{service.usage.missingPolicy}</p> : null}
          {service.uses('question') ? <label className="field" htmlFor="prompt-question"><span>本次问题 <span className="prompt-required">*</span></span>
            <Textarea id="prompt-question" maxLength={30000} aria-required aria-invalid={Boolean(service.fieldErrors['prompt-question'])} aria-describedby={service.fieldErrors['prompt-question'] ? 'prompt-question-error' : undefined} value={service.question} onChange={event => service.setQuestion(event.target.value)} />
            <FieldError id="prompt-question" error={service.fieldErrors['prompt-question']} />
          </label> : null}
          {service.manualFields.map(field => {
            const id = 'prompt-input-' + field.key;
            const props = { id, value: service.values[field.key] || '', maxLength: 30000, 'aria-required': field.required, 'aria-invalid': Boolean(service.fieldErrors[id]), 'aria-describedby': service.fieldErrors[id] ? id + '-error' : undefined, placeholder: placeholders[field.key] || (field.required ? '请填写这次的具体情况。' : '可以留空'), onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => service.setInputValue(field.key, event.target.value) };
            return <label className="field" key={field.key} htmlFor={id}>
              <span>{field.label}{field.required ? <span className="prompt-required" aria-label="必填"> *</span> : <small className="prompt-optional">选填</small>}</span>
              {field.type === 'textarea' ? <Textarea {...props} /> : <Input {...props} type={field.type === 'integer' ? 'number' : 'text'} step={field.type === 'integer' ? '1' : undefined} />}
              <FieldError id={id} error={service.fieldErrors[id]} />
            </label>;
          })}
          {!service.manualFields.length && !service.uses('question') ? <p className="field-note">这份模板不需要额外填写。</p> : null}
          {service.manualFields.some(field => !field.required) ? <p className="field-note">选填项可以留空，生成时会明确标记为“未提供”。</p> : null}
        </section>
        {errors.length ? <div className="prompt-run-errors" id="prompt-run-errors" role="alert" tabIndex={-1}><strong>还有 {errors.length} 处需要处理</strong><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div> : null}
        <div className="prompt-form-footer">
          <div className="prompt-run-actions">
            <Button variant="default" disabled={service.generating || service.sourceLoading || service.meihuaLoading} onClick={() => void service.generate()}>查看预览</Button>
            <Button type="submit" variant="primary" disabled={service.generating || service.copying || service.sourceLoading || service.meihuaLoading || service.deletingId === service.active}>{service.generating ? '正在检查资料…' : service.copying ? '正在复制…' : '生成并复制'}</Button>
          </div>
          <p role="status">{service.generating ? '正在获取并核对完整盘面，月份或多年资料可能需要数秒。' : service.previewStale ? '资料已变更，重新生成后即可复制。' : '自动检查所需资料，只复制文本。'}</p>
        </div>
      </form>
      <section className="prompt-result-pane" aria-label="生成结果">
        <div className="prompt-result-toolbar"><div><h3>完整提示词</h3><span className={'prompt-result-status' + (service.canCopy ? ' ready' : service.previewStale ? ' stale' : '')} role="status">{service.generating ? '正在生成' : service.previewStale ? '待更新' : service.canCopy ? '已就绪' : '待生成'}</span></div>
          <Button variant="default" size="sm" disabled={!service.canCopy || service.copying} onClick={() => void service.copy()}>{service.copying ? '正在复制…' : service.copyFailed ? '再次复制' : '复制'}</Button>
        </div>
        <div className="prompt-result-body">
          {service.preview ? <>
            {service.previewStale ? <p className="prompt-stale-banner">资料已变更，下方保留的是上次结果。请重新生成后复制。</p> : null}
            <pre id="prompt-output" tabIndex={0} aria-label="完整提示词文本">{service.preview.text}</pre>
            {service.copyFailed ? <p className="prompt-copy-failure">浏览器未允许复制。可以再次点“复制”，或在上方全文中手动复制。</p> : null}
            <Disclosure className="prompt-result-sources" summary="本次来源与覆盖范围">
              <ul>{service.preview.sources.map((source, index) => <li key={index}>{source}</li>)}</ul>
              {service.preview.coverage.length ? <ul>{service.preview.coverage.map((item, index) => <li key={index}>{item.label}：{item.from} 至 {item.to}</li>)}</ul> : null}
            </Disclosure>
          </> : <div className="prompt-preview-empty">
            <div className="prompt-paper" aria-hidden="true"><i /><i /><i /><i /></div>
            <h3>把资料准备好，再交给 Agent</h3>
            <p>填好本次内容，完整提示词会出现在这里。</p>
            <div className="prompt-output-outline"><span>将为你合并</span><p>✓ 模板中的分析框架</p><p>✓ {service.needZiwei || service.needProfile ? '所选命盘与时间资料' : '你填写的原始资料'}</p><p>✓ 本次问题与具体情况</p></div>
          </div>}
        </div>
        <div className="prompt-result-meta"><span>{service.preview ? service.preview.text.length.toLocaleString() + ' 字符' : '生成后可查看完整文本'}</span><span>{service.previewStale ? '需重新生成' : service.canCopy ? '可完整复制' : '仅生成文本'}</span></div>
      </section>
    </div>
  </>;
});
