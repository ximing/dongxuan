import { bindServices, observer, useService } from '@rabjs/react';
import { useEffect } from 'react';
import { ChartList } from '@/components/chart-list';
import { Empty, ErrorBanner, PageHeading } from '@/components/chrome';
import { Pagination } from '@/components/pagination';
import { Button, ButtonLink, Input } from '@/components/ui';
import { ChartsService } from './charts.service';

const ChartsContent = observer(function ChartsContent() {
  const service = useService(ChartsService);
  const charts = service.charts;
  useEffect(() => {
    service.load();
    return () => charts.cancel();
  }, [service, charts]);

  return (
    <main>
      <PageHeading title="命盘" actions={<ButtonLink variant="primary" to="/">新建命盘</ButtonLink>}>每张命盘就是一个人。称呼、关系和备注都记在盘上。</PageHeading>
      <ErrorBanner error={charts.error} />
      <div className="toolbar">
        <Input className="text-input" aria-label="搜索称呼或关系" placeholder="搜索称呼或关系" value={service.search} onChange={(event) => service.setSearch(event.target.value)} />
        <div className="filter-tabs">
          {[['all', '全部'], ['archived', '已归档']].map(([value, label]) => (
            <Button key={value} className={service.filter === value ? 'active' : ''} onClick={() => service.setFilter(value)}>{label}</Button>
          ))}
        </div>
      </div>
      <ChartList charts={charts.items} />
      {charts.loaded && !charts.loading && !charts.error && !charts.items.length ? <Empty title="还没有这类命盘">从首页排一盘，保存后随时回来查看。</Empty> : null}
      <Pagination loading={charts.loading} hasMore={charts.hasMore} error={charts.error} count={charts.items.length} onMore={() => void charts.loadMore()} onRetry={() => charts.reload()} />
    </main>
  );
});

export const ChartsPage = bindServices(ChartsContent, [ChartsService]);
