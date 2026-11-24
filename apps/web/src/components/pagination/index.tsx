import { Button } from '@/components/ui';

export function Pagination({ loading, hasMore, error, count, onMore, onRetry }: {
  loading: boolean;
  hasMore: boolean;
  error: string;
  count: number;
  onMore: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="list-pagination">
      {loading ? <span className="field-note" role="status">正在载入{count ? '更多资料' : '资料'}…</span> : null}
      {error ? <p className="form-error" role="alert">{error} <Button className="plain-button" onClick={count ? onMore : onRetry}>重试</Button></p> : null}
      {hasMore ? <Button variant="default" size="sm" disabled={loading} onClick={onMore}>{loading ? '载入中…' : '加载更多'}</Button> : null}
      {count ? <span className="field-note">已显示 {count} 条{hasMore ? '' : ' · 已全部载入'}</span> : null}
    </div>
  );
}
