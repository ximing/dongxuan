import { observer, useService } from '@rabjs/react';
import { type RefObject } from 'react';
import type { PromptField } from '@dongxuan/dto';
import { Button, Checkbox, Input, Select } from '@/components/ui';
import { RichPromptEditor } from '@/components/ui/RichPromptEditor';
import type { PromptEditorHandle } from '@/components/ui/prompt-editor-handle';
import { PromptsService } from './prompts.service';

export const PromptEditor = observer(function PromptEditor({ area }: { area: RefObject<PromptEditorHandle | null> }) {
  const service = useService(PromptsService);
  return <form onSubmit={event => { event.preventDefault(); void service.save(); }}>
    <fieldset className="prompt-editor-fieldset" disabled={service.savingId === service.active || service.deletingId === service.active}>
      <div className="prompt-edit-grid">
        <div className="prompt-editor-pane">
          <p className="prompt-edit-hint">这里修改可重复使用的模板。命盘、日期和本次答案在“使用模板”中填写。</p>
          <div className="prompt-editor-info">
            <label className="field" htmlFor="prompt-edit-title"><span>模板名称</span><Input id="prompt-edit-title" required maxLength={80} value={service.draft.title} onChange={event => service.change({ title: event.target.value })} /></label>
            <label className="field" htmlFor="prompt-edit-system"><span>适用术数</span><Select id="prompt-edit-system" value={service.draft.system} onValueChange={value => service.change({ system: value as 'ziwei' | 'meihua' })} options={[{ value: 'ziwei', label: '紫微斗数' }, { value: 'meihua', label: '梅花易数' }]} /></label>
          </div>
          <div className="prompt-body-toolbar"><span id="prompt-body-label">模板正文</span><div className="actions"><Button variant="ghost" size="sm" onClick={() => service.openLegacyImport()}>导入旧模板文本</Button></div></div>
          <RichPromptEditor key={service.active} handleRef={area} value={service.draft.bodyJson} variables={[...service.draft.inputsSchema.map(field => ({ name: 'input.' + field.key, label: field.label, source: 'input', status: 'available' as const })), ...service.catalog]} disabled={service.savingId === service.active || service.deletingId === service.active} onChange={bodyJson => service.change({ bodyJson })} onOpenVariables={() => service.openVariables()} onError={message => service.reportEditorError(message)} onPasteNotice={() => service.reportPasteNotice()} />
          <p className="field-note" id="prompt-editor-help">资料会显示为中文标签，生成时自动填入。直接粘贴的文字会原样保留；包含旧变量语法的模板请使用“导入旧模板文本”。</p>
          {service.editErrors.length ? <div className="prompt-run-errors" role="alert">{service.editErrors.map((error, index) => <p key={index}>{error}</p>)}</div> : null}
          <div className="prompt-editor-footer">
            <span>{service.savingId === service.active ? '正在保存…' : service.dirty ? '未保存 · 草稿保留在当前页面' : '已保存'}</span>
            <div className="actions"><Button variant="default" onClick={() => service.revert()}>{service.isNew ? '放弃草稿' : '撤销修改'}</Button><Button type="submit" variant="primary" disabled={Boolean(service.savingId) || service.templatesLoading}>{service.savingId === service.active ? '正在保存…' : service.templatesLoading ? '正在读取模板…' : '保存并使用'}</Button></div>
          </div>
        </div>
        <aside className="prompt-inspector" aria-label="模板所需资料">
          <section><h3>关联资料</h3><p className="field-note">从正文自动识别，不用再手动声明。</p>
            {service.editSources.map(variable => <div className="prompt-variable-card" key={variable.name}><div title={variable.name}>{variable.label}</div><span className={variable.status === 'planned' ? 'planned' : ''}>{variable.status === 'planned' ? '待接入' : '自动'}</span></div>)}
            {!service.editSources.length ? <p className="prompt-inspector-empty">还没有引用资料，可以只写固定文本，也可以插入命盘资料。</p> : null}
            <Button variant="default" size="sm" onClick={() => service.openVariables()}>添加资料引用</Button>
          </section>
          <section><h3>本次填写项</h3><p className="field-note">设置名称、类型和是否必填。内部变量名自动生成。</p>
            {service.draft.inputsSchema.map((field, index) => <div className="prompt-field-card" key={field.key}>
              <div className="prompt-field-card-top"><Input maxLength={80} aria-label={'填写项名称 ' + (index + 1)} data-field-name={field.key} value={field.label} onChange={event => service.updateField(index, { label: event.target.value })} /><Button className="prompt-remove-field" aria-label={'移除填写项 ' + field.label} onClick={() => service.removeField(index)}>×</Button></div>
              <div className="prompt-field-options">
                <Select aria-label={'填写项类型 ' + (index + 1)} value={field.type} onValueChange={value => service.updateField(index, { type: value as PromptField['type'] })} options={[{ value: 'text', label: '单行' }, { value: 'textarea', label: '多行' }, { value: 'integer', label: '整数' }]} />
                <label><Checkbox checked={field.required} onChange={event => service.updateField(index, { required: event.target.checked, missingPolicy: event.target.checked ? 'block' : 'marker' })} />必填</label>
                <Button className="prompt-insert-field" onClick={() => service.insert('input.' + field.key)}>插入正文</Button>
              </div>
              <p className="prompt-field-key" title={'input.' + field.key}>{service.editNames.includes('input.' + field.key) ? '已引用到正文' : '尚未引用到正文'}</p>
            </div>)}
            <Button variant="default" size="sm" disabled={service.draft.inputsSchema.length >= 16} onClick={() => {
              service.addField();
              requestAnimationFrame(() => {
                const field = document.querySelector<HTMLInputElement>('[data-field-name="' + service.draft.inputsSchema.at(-1)?.key + '"]');
                field?.focus(); field?.select();
              });
            }}>＋ 添加填写项</Button>
          </section>
        </aside>
      </div>
    </fieldset>
  </form>;
});
