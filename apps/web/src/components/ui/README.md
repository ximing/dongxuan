# 统一交互组件

业务页面统一从 `components/ui` 导入控件，原生表单标签仅允许出现在该目录内。`pnpm --filter @dongxuan/web check:ui` 检查这一约束，构建和类型检查也会执行它。设计参考 `docs/design` 不参与应用构建。

- `Button` / `ButtonLink`：`variant="default | primary | ghost | plain"`，`size="md | sm"`。Button 默认 `type="button"`；提交表单须显式指定 `type="submit"`。
- `Input` / `Textarea`：保留标准文本输入属性和 ref。日期、月份、时间、复选和单选使用专用组件。
- `Select`：传入 `options={[{ value, label, disabled? }]}`、`value` 和 `onValueChange`。值回调统一为字符串，空值为 `''`，支持 `required`、`disabled` 和 `name`。
- `DatePicker` / `MonthPicker` / `TimePicker`：传入 `value` 和 `onValueChange`，值分别为 `YYYY-MM-DD`、`YYYY-MM`、`HH:mm`。日期和月份支持 `min` / `max`。非必填项可清空。
- `Checkbox` / `Radio`：保留 `checked`、`onChange` 等标准属性，同组 Radio 应传相同的 `name`。
- `Disclosure`：用 `summary` 传入折叠标题，children 作为展开内容。
- `useConfirm`：应用启动时注册 `DialogService` 后调用 `await confirm(message)`，使用统一删除确认弹窗，返回布尔结果。

文字输入和按钮保留 HTML 语义；选择器和日期时间使用自定义面板。Select 和 Popover 通过 Radix Primitives 处理键盘、焦点、关闭及浮层定位，控件样式集中在 `ui.css`，业务 CSS 负责布局。
