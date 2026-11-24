import { bindServices, observer, useService } from '@rabjs/react';
import { useEffect } from 'react';
import { ErrorBanner } from '@/components/chrome';
import { Pagination } from '@/components/pagination';
import { Button, Textarea } from '@/components/ui';
import { displayDate } from '@/lib/format';
import { NotesService } from './notes.service';

const NotesContent = observer(function NotesContent({ chartId, snapshotId }: { chartId?: string; snapshotId?: string }) {
  const service = useService(NotesService);
  useEffect(() => {
    service.open(chartId, snapshotId);
    return () => service.notes.cancel();
  }, [service, chartId, snapshotId]);

  return (
    <section className="section-space">
      <div className="section-head"><h2>随手记</h2><span className="small muted">{chartId ? '这张命盘' : '当前保存盘面'}</span></div>
      <div className="note-form">
        <Textarea className="note-editor" aria-label="笔记正文" placeholder="记下此刻的想法，或之后发生的事。" maxLength={30000} value={service.body} onChange={(event) => service.setBody(event.target.value)} />
        <div className="actions">
          {service.editing ? <Button variant="default" size="sm" onClick={() => service.cancelEdit()}>取消编辑</Button> : null}
          <Button variant="primary" size="sm" disabled={!service.body.trim() || service.pending} onClick={() => void service.save()}>{service.pending ? '保存中' : service.editing ? '更新笔记' : '保存笔记'}</Button>
        </div>
      </div>
      <ErrorBanner error={service.error} />
      {service.notes.items.map((note) => (
        <article key={note.id} className="personal-note">
          <div className="note-meta">
            <span>{displayDate(note.createdAt)}</span>
            {note.updatedAt !== note.createdAt ? <span>编辑于 {displayDate(note.updatedAt)}</span> : null}
          </div>
          <p className="note-body">{note.body}</p>
          <div className="note-actions">
            <Button onClick={() => service.edit(note)}>编辑</Button>
            <Button onClick={() => void service.remove(note)}>删除</Button>
          </div>
        </article>
      ))}
      <Pagination loading={service.notes.loading} hasMore={service.notes.hasMore} error={service.notes.error} count={service.notes.items.length} onMore={() => void service.notes.loadMore()} onRetry={() => service.notes.reload()} />
      {service.notes.loaded && !service.notes.error && !service.notes.items.length ? <p className="field-note">还没有留下笔记。</p> : null}
    </section>
  );
});

export const Notes = bindServices(NotesContent, [NotesService]);
