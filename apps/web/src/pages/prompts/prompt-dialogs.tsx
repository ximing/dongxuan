import { observer, useService } from '@rabjs/react';
import { useRef } from 'react';
import { Button, Input, Modal, Radio, Textarea } from '@/components/ui';
import { PromptsService } from './prompts.service';

const sourceLabels: Record<string, string> = { chart: '命盘', profile: '命盘', ziwei: '紫微', input: '本次填写', meihua: '梅花', bazi: '八字' };

export const PromptDialogs = observer(function PromptDialogs() {
  const service = useService(PromptsService);
  const name = useRef<HTMLInputElement>(null), search = useRef<HTMLInputElement>(null);
  return <>
    <Modal open={service.dialog === 'new'} title="新建模板" onClose={() => service.closeDialog()} initialFocus={name}>
      <form onSubmit={event => { event.preventDefault(); service.createDraft(); }}>
        <label className="field" htmlFor="prompt-new-title"><span>模板名称</span><Input ref={name} id="prompt-new-title" required maxLength={80} placeholder="例如：年度回顾" value={service.newTitle} onChange={event => service.setNewTitle(event.target.value)} /></label>
        <fieldset className="prompt-radio-field"><legend>适用术数</legend><div>
          {(['ziwei', 'meihua'] as const).map(system => <label key={system}><Radio name="prompt-new-system" checked={service.newSystem === system} onChange={() => service.setNewSystem(system)} />{system === 'ziwei' ? '紫微斗数' : '梅花易数'}</label>)}
        </div></fieldset>
        <fieldset className="prompt-radio-field"><legend>从哪里开始</legend><div>
          <label><Radio name="prompt-new-base" checked={service.newBase === 'blank'} onChange={() => service.setNewBase('blank')} />空白模板</label>
          <label><Radio name="prompt-new-base" disabled={!service.original} checked={service.newBase === 'current'} onChange={() => service.setNewBase('current')} />复制当前已保存模板</label>
        </div></fieldset>
        <p className="field-note">创建后进入编辑，可以直接粘贴自己的提示词，再插入资料。</p>
        <div className="dialog-actions"><Button variant="default" onClick={() => service.closeDialog()}>取消</Button><Button type="submit" variant="primary">创建并编辑</Button></div>
      </form>
    </Modal>
    <Modal open={service.dialog === 'variables'} title="插入资料" restoreFocus={false} onClose={() => service.closeDialog()} initialFocus={search}>
      <label className="prompt-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg>
        <Input ref={search} type="search" aria-label="搜索可插入资料" placeholder="搜索本命、大限、月份或填写项" value={service.variableSearch} onChange={event => service.setVariableSearch(event.target.value)} />
      </label>
      {!service.catalogLoaded ? <p className="field-note">资料目录尚未加载完成，可以稍后重试。</p> : null}
      <div className="prompt-variable-list">
        {service.availableVariables.map(variable => <Button className="prompt-insert-variable" key={variable.name} title={variable.name} onClick={() => service.insert(variable.name)}>
          <span>{variable.label}<small>{sourceLabels[variable.source] || variable.source}</small></span>
          <span>{variable.status === 'planned' ? '待接入' : '插入'}</span>
        </Button>)}
        {!service.availableVariables.length ? <p className="field-note">没有找到，可以先添加一个本次填写项。</p> : null}
      </div>
    </Modal>
    <Modal open={service.dialog === 'legacy'} title="导入旧模板文本" restoreFocus={false} onClose={() => service.closeDialog()}>
      <p className="field-note">此操作会替换当前正文。旧模板中的双括号引用将转换为中文资料标签，填写项设置保持不变。无法识别的引用会保留为待修复标签。</p>
      <label className="field" htmlFor="prompt-legacy-text"><span>粘贴旧模板</span><Textarea id="prompt-legacy-text" className="prompt-legacy-text" spellCheck={false} value={service.legacyText} onChange={event => service.setLegacyText(event.target.value)} placeholder="在这里粘贴带有旧变量语法的完整模板" /></label>
      {service.legacyError ? <p role="alert" className="form-error">{service.legacyError}</p> : null}
      <div className="dialog-actions"><Button variant="default" onClick={() => service.closeDialog()}>取消</Button><Button variant="primary" disabled={!service.legacyText.trim()} onClick={() => service.importLegacy()}>替换正文并导入</Button></div>
    </Modal>
  </>;
});
