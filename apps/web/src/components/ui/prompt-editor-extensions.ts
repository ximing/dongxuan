import { Extension, Node, mergeAttributes, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Plugin } from '@tiptap/pm/state';
import { normalizePromptDocument, type PromptVariable } from '@dongxuan/dto';

export interface PromptLabels {
  variables: PromptVariable[];
  listeners: Set<() => void>;
}
export function variablePresentation(labels: PromptLabels, name: string) {
  const variable = labels.variables.find(item => item.name === name);
  return { label: variable?.label || '未识别资料', status: !variable ? 'unknown' : variable.status === 'planned' ? 'planned' : 'available' };
}
export function createPromptEditorExtensions(labels: PromptLabels, onError: (message: string) => void) {
  const variable = Node.create({
    name: 'promptVariable', group: 'inline', inline: true, atom: true, selectable: true,
    addAttributes: () => ({ name: { default: null, parseHTML: element => element.getAttribute('data-prompt-variable'), renderHTML: attributes => ({ 'data-prompt-variable': attributes.name }) } }),
    parseHTML: () => [{ tag: 'span[data-prompt-variable]', getAttrs: element => /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/.test(element.getAttribute('data-prompt-variable') || '') ? null : false }],
    renderHTML({ node, HTMLAttributes }) {
      const view = variablePresentation(labels, node.attrs.name);
      return ['span', mergeAttributes(HTMLAttributes, { class: 'prompt-variable-chip', 'data-status': view.status, title: node.attrs.name }), view.label];
    },
    renderText: ({ node }) => variablePresentation(labels, node.attrs.name).label,
    addNodeView() {
      return ({ node }) => {
        let current = node;
        const dom = document.createElement('span'); dom.className = 'prompt-variable-chip'; dom.contentEditable = 'false';
        const refresh = () => {
          const view = variablePresentation(labels, current.attrs.name);
          dom.dataset.promptVariable = current.attrs.name; dom.dataset.status = view.status;
          dom.title = current.attrs.name; dom.textContent = view.label + (view.status === 'planned' ? ' · 待接入' : '');
        };
        labels.listeners.add(refresh); refresh();
        return { dom, update(next) { if (next.type.name !== 'promptVariable') return false; current = next; refresh(); return true; }, destroy() { labels.listeners.delete(refresh); } };
      };
    },
  });
  const invalid = Node.create({
    name: 'promptInvalidVariable', group: 'inline', inline: true, atom: true, selectable: true,
    addAttributes: () => ({
      raw: { default: '', parseHTML: element => element.getAttribute('data-raw'), renderHTML: attrs => ({ 'data-raw': attrs.raw }) },
      reason: { default: 'invalid-name', parseHTML: element => element.getAttribute('data-reason'), renderHTML: attrs => ({ 'data-reason': attrs.reason }) },
    }),
    parseHTML: () => [{ tag: 'span[data-prompt-invalid]' }],
    renderHTML: ({ node, HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { title: node.attrs.raw, 'data-prompt-invalid': '', class: 'prompt-variable-chip', 'data-status': 'invalid' }), '待修复引用'],
    renderText: () => '待修复引用',
  });
  const budget = Extension.create({
    name: 'promptDocumentBudget',
    addProseMirrorPlugins() {
      return [new Plugin({ filterTransaction(transaction) {
        if (!transaction.docChanged) return true;
        try { normalizePromptDocument({ schemaVersion: 1, doc: transaction.doc.toJSON() }); return true; }
        catch (error) { onError(error instanceof Error ? error.message : '正文格式或大小超出限制。'); return false; }
      } })];
    },
  });
  return [StarterKit.configure({ blockquote: false, code: false, codeBlock: false, horizontalRule: false, link: false, strike: false, underline: false, trailingNode: false, heading: { levels: [1, 2, 3] } }), Placeholder.configure({ placeholder: '写下你的分析框架，再插入需要的资料…' }), variable, invalid, budget];
}

/** Inert HTML parsing prevents pasted resources from loading before sanitization. */
export function sanitizePromptHTML(html: string): { html: string; changed: boolean } {
  const template = document.createElement('template'); template.innerHTML = html;
  let changed = false;
  const allowed = new Set(['P', 'DIV', 'BR', 'H1', 'H2', 'H3', 'STRONG', 'B', 'EM', 'I', 'UL', 'OL', 'LI', 'SPAN']);
  const dangerous = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'VIDEO', 'AUDIO', 'SVG', 'MATH', 'LINK', 'META']);
  for (const element of Array.from(template.content.querySelectorAll('*'))) {
    if (dangerous.has(element.tagName)) { element.remove(); changed = true; continue; }
    if (!allowed.has(element.tagName)) { element.replaceWith(...element.childNodes); changed = true; continue; }
    for (const attribute of Array.from(element.attributes)) {
      const internal = element.tagName === 'SPAN' && ['data-prompt-variable', 'data-prompt-invalid', 'data-raw', 'data-reason'].includes(attribute.name);
      const start = element.tagName === 'OL' && attribute.name === 'start' && /^\d{1,7}$/.test(attribute.value) && Number(attribute.value) > 0 && Number(attribute.value) <= 1000000;
      if (!internal && !start) { element.removeAttribute(attribute.name); if (attribute.name !== 'class') changed = true; }
    }
  }
  return { html: template.innerHTML, changed };
}
export function asEditorContent(document: { doc: unknown }): JSONContent { return document.doc as JSONContent; }
