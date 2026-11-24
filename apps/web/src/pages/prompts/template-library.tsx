import { observer, useService } from '@rabjs/react';
import { Fragment } from 'react';
import { Button, Input } from '@/components/ui';
import { describeTemplate, templateNames } from './prompt-model';
import { PromptsService } from './prompts.service';

export const TemplateLibrary = observer(function TemplateLibrary() {
  const service = useService(PromptsService);
  return <aside className="prompt-library" aria-label="模板库">
    <div className="prompt-library-title"><h2>我的模板 <span>{service.library.length}</span></h2></div>
    <label className="prompt-search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg>
      <Input type="search" aria-label="搜索模板" placeholder="搜索名称或用途" value={service.search} onChange={event => service.setSearch(event.target.value)} />
    </label>
    <div className="prompt-filters" aria-label="筛选模板">
      {([['all', '全部'], ['favorite', '常用'], ['ziwei', '紫微'], ['meihua', '梅花']] as const).map(([value, label]) =>
        <Button key={value} aria-pressed={service.filter === value} className={service.filter === value ? 'active' : ''} onClick={() => service.setFilter(value)}>{label}</Button>)}
    </div>
    <div className="prompt-template-list">
      {(['ziwei', 'meihua'] as const).map(system => <Fragment key={system}>
        {service.filteredTemplates.some(template => template.system === system) ? <p className="prompt-group-label">{system === 'ziwei' ? '紫微斗数' : '梅花易数'}</p> : null}
        {service.filteredTemplates.filter(template => template.system === system).map(template => {
          const names = templateNames(template);
          const used = template.inputsSchema.filter(field => names.includes('input.' + field.key));
          const required = used.filter(field => field.required).length + Number(names.includes('question'));
          return <Button key={template.id} className={'prompt-template' + (service.active === template.id ? ' active' : '')} aria-pressed={service.active === template.id} onClick={() => service.select(template)}>
            <span className="prompt-template-title"><span>{template.title}{service.hasDraft(template.id) ? <i className="prompt-draft-dot" title="有未保存草稿" aria-label="有未保存草稿" /> : null}</span>{service.favorites.includes(template.id) ? <span className="prompt-template-star" aria-label="常用">★</span> : null}</span>
            <span className="prompt-template-desc">{describeTemplate(template)}</span>
            <small>{template.id.startsWith('draft:') ? '未保存草稿' : required ? required + ' 项必填' : used.length ? '填写项均可选' : '无需额外填写'}{used.length > required ? ' · ' + (used.length - required) + ' 项选填' : ''}</small>
          </Button>;
        })}
      </Fragment>)}
      {!service.templatesLoading && !service.filteredTemplates.length ? <p className="prompt-library-empty">{service.filter === 'favorite' ? '点模板旁的星标，就能在这里找到常用模板。' : service.library.length ? '没有找到模板，试试其他名称。' : '还没有模板，可以新建一份。'}</p> : null}
    </div>
    {service.templatesLoading ? <p className="prompt-library-loading" role="status">正在读取全部模板…</p> : null}
    {service.templatesError ? <div className="prompt-library-error" role="alert"><p>{service.templatesError}</p><Button variant="default" size="sm" onClick={() => void service.loadTemplates()}>重试加载</Button></div> : null}
    <div className="prompt-library-bottom">
      <Button variant="default" onClick={() => service.openNew()}>＋ 新建模板</Button>
      <p>模板保存在你的账号下。<br />本次填写不存入模板。</p>
      {service.favoriteNotice ? <p role="status">{service.favoriteNotice}</p> : null}
    </div>
  </aside>;
});
