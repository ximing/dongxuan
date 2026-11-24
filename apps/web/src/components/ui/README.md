# 统一交互组件

Modal 通过 open、title、onClose 与可选 initialFocus ref 提供模态窗口，统一处理焦点、Esc 与遮罩关闭。原生 dialog 内使用文本控件和 Radio；带 Portal 的控件须另行处理浮层容器。

ActionMenu 接收低频操作 items，统一处理外部点击、Esc、焦点恢复和方向键选择。删除操作通过 destructive 标记，确认仍使用 useConfirm / DialogService。

业务页面统一从 `components/ui` 导入控件，原生表单标签仅允许出现在该目录内。`pnpm --filter @dongxuan/web check:ui` 检查这一约束，构建和类型检查也会执行它。设计参考 `docs/design` 不参与应用构建。

- `Button` / `ButtonLink`：`variant="default | primary | ghost | plain"`，`size="md | sm"`。Button 默认 `type="button"`；提交表单须显式指定 `type="submit"`。
- `Input` / `Textarea`：保留标准文本输入属性和 ref。日期、月份、时间、复选和单选使用专用组件。
- `Select`：传入 `options={[{ value, label, disabled? }]}`、`value` 和 `onValueChange`。值回调统一为字符串，空值为 `''`，支持 `required`、`disabled` 和 `name`。
- `DatePicker` / `MonthPicker` / `TimePicker`：传入 `value` 和 `onValueChange`，值分别为 `YYYY-MM-DD`、`YYYY-MM`、`HH:mm`。日期和月份支持 `min` / `max`。非必填项可清空。
- `Checkbox` / `Radio`：保留 `checked`、`onChange` 等标准属性，同组 Radio 应传相同的 `name`。
- `Disclosure`：用 `summary` 传入折叠标题，children 作为展开内容。
- `useConfirm`：应用启动时注册 `DialogService` 后调用 `await confirm(message)`，使用统一删除确认弹窗，返回布尔结果。

文字输入和按钮保留 HTML 语义；选择器和日期时间使用自定义面板。Select 和 Popover 通过 Radix Primitives 处理键盘、焦点、关闭及浮层定位，控件样式集中在 `ui.css`，业务 CSS 负责布局。

`RichPromptEditor` 供提示词编辑模式按需加载，直接从专用文件导入，避免 UI barrel 将 Tiptap 带进默认使用页面。正文使用共享 `PromptDocument`，`promptVariable` 只存稳定 `name`，中文标签由资料目录与填写项实时提供。React 持有编辑器，Service 只通过 `PromptEditorHandle` 同步读取文档、保存选区和插入引用。普通粘贴不解析旧变量，旧模板需使用显式导入操作。
