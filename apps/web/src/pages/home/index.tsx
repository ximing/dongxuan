import { bindServices, observer, useService } from '@rabjs/react';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { BirthFields } from '@/components/birth-fields';
import { ErrorBanner } from '@/components/chrome';
import { Button, Disclosure, Input } from '@/components/ui';
import { HomeService } from './home.service';

const HomeContent = observer(function HomeContent() {
  const service = useService(HomeService);
  const navigate = useNavigate();
  const saved = service.charts.filter((chart) => !chart.archivedAt);

  useEffect(() => {
    void service.load();
  }, [service]);

  return (
    <main className="cast-content">
      <section className="cast-heading">
        <h1>紫微斗数</h1>
        <div className="system-tabs">
          <Button disabled title="规划中">八字<small>待续</small></Button>
          <Button disabled title="规划中">奇门<small>待续</small></Button>
        </div>
      </section>
      <div className="personal-cast-layout">
        <form className="personal-form" onSubmit={(event) => { event.preventDefault(); void service.cast().then((id) => { if (id) navigate(`/charts/${id}`); }); }}>
          <div className="form-topline">
            <h2>新建命盘</h2>
            <Button type="button" variant="ghost" size="sm" onClick={() => service.useExample()}>使用示例</Button>
          </div>
          <div className="source-line">
            <span>填写出生资料，即可排盘。</span>
          </div>
          <div className="cast-fields" style={{ marginBottom: 14 }}>
            <label className="field"><span>称呼</span><Input required maxLength={64} placeholder="姓名或盘名" value={service.title} onChange={(event) => service.setTitle(event.target.value)} /></label>
          </div>
          <BirthFields value={service.birth} onChange={(value) => service.setBirth(value)} required compact />
          <div className="cast-rule">
            <Disclosure className="calculation-details" summary={<>排盘规则 <span>晚子归次日</span></>}>
              <p>春节年界；运限按实际状态分段。节气四柱按技能时辰取样，与库内四柱分别展示。只知道“子时”时，请确认早子或晚子。</p>
            </Disclosure>
          </div>
          <ErrorBanner error={service.error} />
          <div className="form-footer">
            <span className="field-note">称呼、关系和备注都记在这张盘上。</span>
            <Button type="submit" variant="primary" disabled={service.pending}>{service.pending ? '排盘中…' : '开始排盘'}<span aria-hidden="true">›</span></Button>
          </div>
        </form>
        <aside className="people-book">
          <div className="people-book-head">
            <h2>已有命盘</h2>
          </div>
          <p className="archive-hint">点开即可查看</p>
          <div className="people-options">
            {saved.map((chart) => (
              <div className="people-option" key={chart.id}>
                <Button type="button" className="person-pick" onClick={() => navigate(`/charts/${chart.id}`)}>
                  <span className="avatar">{chart.title.slice(0, 1)}</span>
                  <span><strong>{chart.title}</strong><small>{chart.date}{chart.timeName ? ` · ${chart.timeName}` : ''}</small></span>
                  {chart.relation ? <span className="relation">{chart.relation}</span> : null}
                </Button>
              </div>
            ))}
            {service.sourceLoading ? <p className="field-note" role="status">正在载入命盘…</p> : !saved.length ? <p className="field-note">还没有命盘，先在左边排一张。</p> : null}
          </div>
          <div className="book-note"><Link to="/charts">全部命盘 ›</Link></div>
        </aside>
      </div>
      <div className="personal-below"><span>命盘与笔记，随时回来查看。</span><Link to="/charts">我的命盘 ›</Link></div>
    </main>
  );
});

export const HomePage = bindServices(HomeContent, [HomeService]);
