import { bindServices, observer, useService } from '@rabjs/react';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { ErrorBanner, PageHeading } from '@/components/chrome';
import { ActionMenu, Button } from '@/components/ui';
import { PromptDialogs } from './prompt-dialogs';
import type { PromptEditorHandle } from '@/components/ui/prompt-editor-handle';
const PromptEditor = lazy(() => import('./prompt-editor').then(module => ({ default: module.PromptEditor })));
import { PromptUse } from './prompt-use';
import { TemplateLibrary } from './template-library';
import { PromptsService } from './prompts.service';

const PromptsContent = observer(function PromptsContent() {
  const service = useService(PromptsService);
  const [params, setParams] = useSearchParams();
  const area = useRef<PromptEditorHandle>(null);
  useEffect(() => { service.attachEditor(() => area.current); return () => service.attachEditor(null); }, [service]);
  const previousMobileView = useRef(service.mobileView);
  const snapshot = params.get('snapshot'), chart = params.get('chart'), meihua = params.get('meihuaDraft');
  const template = params.get('template'), system = params.get('system');

  useEffect(() => {
    service.attachTemplateNavigation((id, replace) => {
      if (params.get('template') === id) return;
      const next = new URLSearchParams(params);
      if (id) next.set('template', id); else next.delete('template');
      setParams(next, { replace, preventScrollReset: true });
    });
    return () => service.attachTemplateNavigation(null);
  }, [service, params, setParams]);
  useEffect(() => { void service.boot(); return () => service.dispose(); }, [service]);
  useEffect(() => { service.applyTemplateRoute(template, system); }, [service, service.templatesLoaded, template, system]);
  useEffect(() => {
    if (meihua && service.original) void service.loadDraft(meihua);
    return () => service.cancelDraft();
  }, [service, meihua, Boolean(service.original)]);
  useEffect(() => {
    if (snapshot) void service.loadSnapshot(snapshot, chart);
    return () => service.cancelSnapshot();
  }, [service, snapshot, chart]);
  useEffect(() => {
    if (!service.validationVersion) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(service.focusTarget);
      if (!target) return;
      (target.matches('input,textarea,button,[tabindex]') ? target : target.querySelector<HTMLElement>('button,input,textarea'))?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [service, service.validationVersion]);
  useEffect(() => {
    if (!service.selectTextVersion) return;
    const target = document.getElementById('prompt-output'), selection = window.getSelection();
    if (!target || !selection) return;
    const range = document.createRange(); range.selectNodeContents(target);
    selection.removeAllRanges(); selection.addRange(range); target.focus();
  }, [service, service.selectTextVersion]);
  useEffect(() => {
    if (!service.hasDrafts) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [service, service.hasDrafts]);
  useEffect(() => {
    if (previousMobileView.current === service.mobileView) return;
    previousMobileView.current = service.mobileView;
    if (!window.matchMedia('(max-width: 650px)').matches) return;
    const frame = requestAnimationFrame(() => {
      document.querySelector('.prompt-mobile-tabs')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [service, service.mobileView]);

  return <main className="prompts-page" onKeyDown={event => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !service.dialog) {
      event.preventDefault();
      if (service.mode === 'edit') void service.save(); else void service.generate(true);
    }
  }}>
    <PageHeading title="提示词" actions={<Button variant="default" onClick={() => service.openNew()}>＋ 新建模板</Button>}>
      选一份模板，填好这次的资料，复制给外部 Agent。
    </PageHeading>
    <ErrorBanner error={service.error} />
    <div className="prompt-workspace">
      <TemplateLibrary />
      <section className="prompt-work-area" aria-label="提示词工作区">
        <div className="prompt-work-toolbar">
          <div className="prompt-mode-switch" aria-label="工作模式">
            <Button aria-pressed={service.mode === 'use'} className={service.mode === 'use' ? 'active' : ''} disabled={service.isNew} title={service.isNew ? '先保存新模板，再填写本次资料' : undefined} onClick={() => service.setMode('use')}>使用模板</Button>
            <Button aria-pressed={service.mode === 'edit'} className={service.mode === 'edit' ? 'active' : ''} disabled={!service.active} onClick={() => service.setMode('edit')}>编辑模板</Button>
          </div>
          <span className="prompt-toolbar-note">{service.mode === 'use' ? '只填写这次需要的内容' : '草稿暂存在当前页面，离开前请保存'}</span>
          {service.original ? <div className="prompt-toolbar-actions">
            <Button variant="ghost" size="sm" onClick={() => service.openNew(true)}>另存副本</Button>
            <ActionMenu items={[{ label: '删除模板', destructive: true, disabled: service.savingId === service.active || service.deletingId === service.active, onSelect: () => void service.remove() }]} />
          </div> : null}
        </div>
        {service.notice ? <p className={'prompt-feedback' + (service.copyFailed ? ' warning' : '')} role="status">{service.notice}</p> : null}
        {service.original && service.mode === 'use' && service.dirty ? <div className="prompt-draft-notice">
          <span>有未保存的编辑草稿，当前使用已保存版本。</span>
          <Button onClick={() => service.setMode('edit')}>恢复编辑</Button>
        </div> : null}
        {!service.active ? <div className="prompt-empty-workspace">
          <h2>{service.templatesLoading ? '正在读取模板…' : '从一份常用提示词开始'}</h2>
          <p>{service.templatesLoading ? '读取完成后即可填写本次资料。' : '新建模板，粘贴自己的分析框架，再插入需要的命盘资料。'}</p>
          {!service.templatesLoading ? <Button variant="primary" onClick={() => service.openNew()}>新建模板</Button> : null}
        </div> : service.mode === 'edit' ? <Suspense fallback={<p className="prompt-editor-loading" role="status">正在打开正文编辑器…</p>}><PromptEditor area={area} /></Suspense> : <PromptUse />}
      </section>
    </div>
    <PromptDialogs />
  </main>;
});

export const PromptsPage = bindServices(PromptsContent, [PromptsService]);
