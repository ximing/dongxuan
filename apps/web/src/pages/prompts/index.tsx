import { bindServices, observer, useService } from '@rabjs/react';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import type { PromptField } from '@dongxuan/dto';
import { CopyButton, ErrorBanner, PageHeading } from '@/components/chrome';
import { Pagination } from '@/components/pagination';
import { Button, Checkbox, DatePicker, Disclosure, Input, MonthPicker, Select, Textarea } from '@/components/ui';
import { PromptsService } from './prompts.service';

const PromptsContent = observer(function PromptsContent() {
  const service = useService(PromptsService);
  const [params] = useSearchParams();
  const area = useRef<HTMLTextAreaElement>(null);
  const snapshotFromUrl = params.get('snapshot');
  const chartFromUrl = params.get('chart');
  const draftFromUrl = params.get('meihuaDraft');

  useEffect(() => {
    void service.boot();
  }, [service]);

  useEffect(() => {
    service.templates.reload('/api/v2/prompt-templates');
    return () => service.templates.cancel();
  }, [service]);

  useEffect(() => {
    service.selectInitial(params.get('system'));
  }, [service, service.catalogLoaded, service.templates.loaded, service.templates.items, params]);

  useEffect(() => {
    if (!draftFromUrl || !service.catalogLoaded) return;
    void service.loadDraft(draftFromUrl);
  }, [service, service.catalogLoaded, draftFromUrl]);

  useEffect(() => {
    if (!snapshotFromUrl || !service.catalogLoaded) return;
    void service.loadSnapshot(snapshotFromUrl, chartFromUrl);
    return () => service.cancelSnapshot();
  }, [service, service.catalogLoaded, snapshotFromUrl, chartFromUrl]);

  const manualFields = service.draft.inputsSchema.filter((field) => service.uses(`input.${field.key}`));

  return (
    <main>
      <PageHeading title="提示词" actions={<Button variant="primary" onClick={() => service.startBlank()}>新建模板</Button>}>保存模板，填入盘面资料，复制给外部 Agent。</PageHeading>
      <ErrorBanner error={service.error} />
      {!service.catalogLoaded ? <p className="loading">正在读取模板…</p> : null}
      <div className="prompt-layout">
        <aside className="prompt-library">
          <div className="prompt-list">
            {service.templates.items.map((template) => (
              <Button className={`prompt-list-item ${service.active === template.id ? 'active' : ''}`} key={template.id} onClick={() => { if (service.guard()) service.select(template); }}>
                <strong>{template.title}</strong>
                <small>{template.system === 'ziwei' ? '紫微斗数' : '梅花易数'}</small>
              </Button>
            ))}
          </div>
          <Pagination loading={service.templates.loading} hasMore={service.templates.hasMore} error={service.templates.error} count={service.templates.items.length} onMore={() => void service.templates.loadMore()} onRetry={() => service.templates.reload()} />
          <p className="prompt-storage">模板保存在你的账号下。<br />本次填写与展开资料不存入模板。</p>
        </aside>
        <div className="prompt-main">
          <form className="prompt-editor" onSubmit={(event) => { event.preventDefault(); void service.save(); }}>
            <div className="prompt-editor-head">
              <label className="field">模板名称<Input required maxLength={80} value={service.draft.title} onChange={(event) => service.change({ title: event.target.value })} /></label>
              <label className="field">适用术数
                <Select value={service.draft.system} onValueChange={(value) => service.setSystem(value as 'ziwei' | 'meihua')} options={[{ value: 'ziwei', label: '紫微斗数' }, { value: 'meihua', label: '梅花易数' }]} />
              </label>
            </div>
            <label className="field prompt-body-label">模板正文
              <Textarea ref={area} required maxLength={30000} spellCheck={false} value={service.draft.body} onChange={(event) => service.change({ body: event.target.value })} />
            </label>
            <Disclosure className="prompt-input-schema" summary={<>本次填写项定义（{service.draft.inputsSchema.length} 项）</>}>
              <p className="field-note">使用 {'{{input.变量名}}'} 引用；选填空值明确标记为“未提供”。</p>
              {service.draft.inputsSchema.map((field, index) => (
                <div className="input-schema-row" key={index}>
                  <Input aria-label={`第 ${index + 1} 项变量名`} maxLength={32} value={field.key} onChange={(event) => service.updateField(index, { key: event.target.value })} />
                  <Input aria-label={`第 ${index + 1} 项名称`} maxLength={80} value={field.label} onChange={(event) => service.updateField(index, { label: event.target.value })} />
                  <Select aria-label={`第 ${index + 1} 项类型`} value={field.type} onValueChange={(value) => service.updateField(index, { type: value as PromptField['type'] })} options={[{ value: 'text', label: '单行' }, { value: 'textarea', label: '多行' }, { value: 'integer', label: '整数' }]} />
                  <label><Checkbox checked={field.required} onChange={(event) => service.updateField(index, { required: event.target.checked, missingPolicy: event.target.checked ? 'block' : 'marker' })} />必填</label>
                  <Button type="button" onClick={() => service.removeField(index)}>移除</Button>
                </div>
              ))}
              <Button type="button" variant="default" size="sm" disabled={service.draft.inputsSchema.length >= 16} onClick={() => service.addField()}>添加填写项</Button>
            </Disclosure>
            <Disclosure className="prompt-variables" summary={<>插入变量</>}>
              <div>
                {service.catalog.map((variable) => (
                  <Button type="button" key={variable.name} title={`{{${variable.name}}}`} onClick={() => service.insert(area.current, variable.name)}>{variable.label}{variable.status === 'planned' ? '（待接入）' : ''}</Button>
                ))}
                {service.draft.inputsSchema.filter((field) => /^[a-z][a-z0-9_]{0,31}$/.test(field.key)).map((field) => (
                  <Button type="button" key={field.key} title={`{{input.${field.key}}}`} onClick={() => service.insert(area.current, `input.${field.key}`)}>{field.label}（填写）</Button>
                ))}
              </div>
              <p>按光标位置插入。模板内容只做一次纯文本替换。</p>
            </Disclosure>
            <div className="prompt-editor-actions">
              <span>{service.dirty ? '有未保存的修改' : '已保存'}</span>
              <div className="actions">
                <Button type="button" variant="ghost" size="sm" onClick={() => void service.remove()}>删除</Button>
                <Button type="button" variant="default" size="sm" onClick={() => service.saveCopy()}>另存副本</Button>
                <Button type="button" variant="default" size="sm" onClick={() => service.revert()}>撤销修改</Button>
                <Button type="submit" variant="primary" size="sm" disabled={service.pending}>保存模板</Button>
              </div>
            </div>
          </form>
          {service.notice ? <p className="prompt-notice" role="status">{service.notice}</p> : null}
          <section className="prompt-context" aria-busy={service.pending}>
            <div className="section-head"><h2>填入资料</h2><span>复制前预览</span></div>
            <h3 className="prompt-source-heading">自动引用资料</h3>
            <div className="form-grid">
              {service.needZiwei || service.needProfile ? (
                <label className="field wide">{service.needZiwei ? '紫微命盘 · 基础快照' : '命盘'}
                  <Select value={service.chartId} onValueChange={(value) => service.selectChart(value)} options={[{ value: '', label: '请选择命盘' }, ...service.charts.map((chart) => ({ value: chart.id, label: chart.title }))]} />
                  {service.needProfile ? <span className="field-note">称呼和性别取自这张命盘。</span> : null}
                </label>
              ) : null}
              {service.snapshotId && service.needZiwei ? (
                <div className="field wide">
                  <p className="field-note">{service.sourceLoading ? '正在读取保存盘面的查询条件…' : service.sourceSnapshot ? `已绑定保存快照：${service.sourceLabel}。同范围资料取自该快照；其他层级仍由同一基础盘派生。` : '保存快照尚未载入，请核对来源或改用基础盘取数。'}</p>
                  <Button variant="default" size="sm" type="button" style={{ width: 'fit-content' }} onClick={() => { service.clearSnapshotBinding(); service.invalidate(); }}>改用基础盘取数</Button>
                </div>
              ) : null}
              {service.sourceNotice && service.needZiwei ? <p className="field-note wide" role="status">{service.sourceNotice}</p> : null}
              {service.usesDate ? (
                <label className="field wide">基准日 · 定义虚岁和当前大限
                  <DatePicker value={service.asOf} min="1901-01-01" max="2099-12-31" onValueChange={(value) => service.setAsOf(value)} />
                </label>
              ) : null}
              {service.usesMonths ? (
                <div className="field wide">
                  <span>目标月份窗口 · 阳历</span>
                  <div className="prompt-range">
                    <MonthPicker value={service.start} onValueChange={(value) => service.setStart(value)} />
                    <span>起，连续</span>
                    <Select value={service.count} onValueChange={(value) => service.setCount(Number(value))} options={Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: `${index + 1} 个月` }))} />
                  </div>
                  <p className="field-note">按实际流月拆段，每段保留对应大限、流年和虚岁。</p>
                </div>
              ) : null}
              {service.usesYears ? (
                <label className="field wide">目标流年 · 春节为界
                  <Input value={service.years} placeholder="2026, 2027, 2028" onChange={(event) => service.setYears(event.target.value)} />
                  <span className="field-note">年份以逗号分隔，完整覆盖该流年，不用单日盘代替全年。</span>
                </label>
              ) : null}
            </div>
            {service.needMeihua ? <div className="source-missing">完整梅花卦例尚未接入。需要卦象的模板会列出缺失资料；原始请求模板可以只引用问题和数字。</div> : null}
            {service.names.some((name) => name.startsWith('bazi.')) ? <div className="source-missing">八字命盘尚未接入，不能用紫微四柱替代。</div> : null}
            {!service.needZiwei && !service.needProfile && !service.needMeihua ? <p className="field-note">本模板仅使用明确填写的原始资料。</p> : null}
            {service.meihua && service.draft.system === 'meihua' ? <p className="field-note">已带入原始草稿：{service.meihua.question}（尚未起卦）</p> : null}
            <div className="prompt-manual">
              <h3>本次填写</h3>
              {service.draft.missingPolicy ? <p className="field-note">{service.draft.missingPolicy}</p> : null}
              <div className="form-grid">
                {service.uses('question') ? (
                  <label className="field wide">本次问题 · 必填<Textarea value={service.question} onChange={(event) => service.setQuestion(event.target.value)} /></label>
                ) : null}
                {manualFields.map((field) => (
                  <label className={`field ${field.type === 'integer' ? '' : 'wide'}`} key={field.key}>
                    <span>{field.label} <small className="muted">{field.required ? '必填' : '选填'}</small></span>
                    {field.type === 'textarea' ? (
                      <Textarea maxLength={30000} value={service.values[field.key] || ''} placeholder={field.required ? '请填写' : '未填写时明确标记为未提供'} onChange={(event) => service.setInputValue(field.key, event.target.value)} />
                    ) : (
                      <Input type={field.type === 'integer' ? 'number' : 'text'} step={field.type === 'integer' ? '1' : undefined} value={service.values[field.key] || ''} onChange={(event) => service.setInputValue(field.key, event.target.value)} />
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div className="prompt-run">
              <Button variant="default" disabled={service.pending || service.sourceLoading || Boolean(service.snapshotId && !service.sourceSnapshot)} onClick={() => void service.generate()}>{service.pending ? '正在检查资料…' : '检查并生成预览'}</Button>
              {service.preview?.text && !service.preview.diagnostics.length ? <CopyButton text={service.preview.text} label="复制完整提示词" /> : <Button variant="primary" disabled>复制完整提示词</Button>}
              <span>仅复制文本，供外部 Agent 使用。</span>
            </div>
            {service.pending ? <p className="calculation-status" role="status">正在获取并核对完整盘面，多流年或月份范围可能需要数秒，请稍候…</p> : null}
            {service.preview?.diagnostics.length ? <ul className="error-list" role="alert">{service.preview.diagnostics.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}
          </section>
          {service.preview?.text && !service.preview.diagnostics.length ? (
            <section className="prompt-preview">
              <div className="section-head"><h2>展开结果</h2><span>{service.preview.text.length.toLocaleString()} 字符</span></div>
              <p className="field-note">来源：{service.preview.sources.join('；')}</p>
              {service.preview.coverage.length ? (
                <Disclosure className="prompt-coverage" summary={<>实际时间覆盖（{service.preview.coverage.length} 段）</>}>
                  <ul>{service.preview.coverage.map((item, index) => <li key={index}>{item.label}：{item.from} 至 {item.to}</li>)}</ul>
                </Disclosure>
              ) : null}
              <pre tabIndex={0}>{service.preview.text}</pre>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
});

export const PromptsPage = bindServices(PromptsContent, [PromptsService]);
