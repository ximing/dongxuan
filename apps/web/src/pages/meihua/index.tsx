import { bindServices, observer, useService } from '@rabjs/react';
import { useEffect, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ErrorBanner } from '@/components/chrome';
import { Pagination } from '@/components/pagination';
import { Button, Disclosure, Input, Select, Textarea } from '@/components/ui';
import { displayDate } from '@/lib/format';
import { MeihuaService } from './meihua.service';

const MeihuaContent = observer(function MeihuaContent() {
  const service = useService(MeihuaService);
  const navigate = useNavigate();
  useEffect(() => {
    void service.loadCharts();
    service.drafts.reload('/api/v2/meihua-drafts');
    return () => service.drafts.cancel();
  }, [service]);

  async function save(event: FormEvent) {
    event.preventDefault();
    await service.save();
  }

  return (
    <main>
      <section className="cast-heading"><h1>梅花易数</h1><span className="current-system">两数起卦</span></section>
      <ErrorBanner error={service.error} />
      {service.message ? <p className="success-banner" role="status">{service.message}</p> : null}
      <div className="meihua-layout">
        <form className="panel" onSubmit={(event) => void save(event)}>
          <div className="section-head"><h2>起卦资料</h2><span className="tag">规则待确认</span></div>
          <p className="field-note">记录一件事，按需关联一张命盘。</p>
          <div className="form-grid" style={{ marginTop: 20 }}>
            <label className="field wide">需要断事的问题<Textarea required maxLength={10000} value={service.question} onChange={(event) => service.setQuestion(event.target.value)} placeholder="具体说明想问的事情。" /></label>
            <label className="field">第一个数字<Input type="number" step="1" required value={service.numberA} onChange={(event) => service.setNumberA(event.target.value)} /></label>
            <label className="field">第二个数字<Input type="number" step="1" required value={service.numberB} onChange={(event) => service.setNumberB(event.target.value)} /></label>
            <label className="field wide">关联命盘 · 选填
              <Select value={service.chartId} onValueChange={(value) => service.setChart(value)} options={[{ value: '', label: <>不关联</> }, ...service.charts.filter((chart) => !chart.archivedAt).map((chart) => ({ value: chart.id, label: <>{chart.title}</> }))]} />
            </label>
          </div>
          <Disclosure className="calculation-details" summary={<>需要确认的起卦规则</>}>
            <p>上下卦数字次序、取值范围、余零处理、动爻取法、是否加入时间，以及体用规则。</p>
          </Disclosure>
          <div className="form-footer">
            <Button type="submit" variant="default" disabled={service.pending}>{service.pending ? '保存中' : service.active ? '更新原始草稿' : '保存原始草稿'}</Button>
            <Button type="button" variant="primary" disabled={service.pending} onClick={() => { void service.save().then((draft) => { if (draft) navigate(`/prompts?system=meihua&meihuaDraft=${draft.id}`); }); }}>填写关联提示词</Button>
          </div>
          <p className="field-note" style={{ marginTop: 12 }}>完整卦例模板需等待真实卦象；原始起卦请求模板可以先复制问题和数字。</p>
        </form>
        <aside>
          <section className="panel">
            <h2>卦例结果</h2>
            <div className="meihua-pending">尚未生成卦象</div>
            <dl className="detail-list">{['上卦 / 下卦', '动爻', '本卦 / 互卦 / 变卦', '体用关系'].map((label) => <div key={label}><dt>{label}</dt><dd>等待规则确认</dd></div>)}</dl>
          </section>
          <section className="panel">
            <div className="section-head"><h2>原始草稿</h2><small>{service.drafts.items.length} 条</small></div>
            {service.drafts.items.map((draft) => (
              <article className="meihua-draft" key={draft.id}>
                <Button className="plain-button" style={{ textAlign: 'left' }} onClick={() => service.openDraft(draft)}>{draft.question}</Button>
                <small>{draft.numberA} / {draft.numberB} · {displayDate(draft.createdAt)} · 未起卦</small>
                <div className="actions" style={{ marginTop: 8 }}>
                  <Link className="text-link small" to={`/prompts?system=meihua&meihuaDraft=${draft.id}`}>关联提示词</Link>
                  <Button className="plain-button muted" onClick={() => void service.remove(draft)}>删除</Button>
                </div>
              </article>
            ))}
            <Pagination loading={service.drafts.loading} hasMore={service.drafts.hasMore} error={service.drafts.error} count={service.drafts.items.length} onMore={() => void service.drafts.loadMore()} onRetry={() => service.drafts.reload()} />
            {service.drafts.loaded && !service.drafts.error && !service.drafts.items.length ? <p className="field-note">还没有草稿。保存后可随时回来查看。</p> : null}
          </section>
        </aside>
      </div>
    </main>
  );
});

export const MeihuaPage = bindServices(MeihuaContent, [MeihuaService]);
