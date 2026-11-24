import type { ChartRecordSummary } from '@dongxuan/dto';
import { Link } from 'react-router';
import { ButtonLink } from '@/components/ui';
import { displayDate } from '@/lib/format';

export function ChartList({ charts }: { charts: ChartRecordSummary[] }) {
  return (
    <div className="chart-book-list">
      {charts.map((chart) => (
        <article className="personal-chart-card" key={chart.id}>
          <span className="chart-card-mark">紫微</span>
          <div className="grow">
            <h3><Link to={`/charts/${chart.id}`}>{chart.title}</Link></h3>
            <p>{chart.gender} · {chart.date} · {chart.timeName}</p>
            <small>{chart.relation ? `${chart.relation} · ` : ''}{chart.migrationStatus === 'failed' ? '旧盘待修复' : chart.fiveElementsClass}{chart.archivedAt ? ' · 已归档' : ''} · {displayDate(chart.createdAt)}</small>
          </div>
          <ButtonLink variant="default" size="sm" to={`/charts/${chart.id}`}>打开</ButtonLink>
        </article>
      ))}
    </div>
  );
}
