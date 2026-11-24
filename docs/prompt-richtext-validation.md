# 提示词富文本实施与验收

日期：2026-11-24。开发依据：[已复审方案](prompt-richtext-plan.md)、[方案审查记录](prompt-richtext-review.md)。开发由 SubAgent 实施，协调者负责独立浏览器验收。本文记录当前已执行的检查，不把尚未完成的人工验收列为通过。

## 已落地

- 编辑正文使用精简 Tiptap 3.31.3；资料引用是行内原子节点，仅保存稳定 name。正文、侧栏和插入目录显示中文名称；填写项改名会刷新已有标签，不修改节点 JSON 或重建编辑器。
- 共享文档模型位于 packages/dto/src/prompt-document.ts，提供严格白名单、预算、规范化、旧文转换、AST 引用提取、JSONB 键序无关比较和纯文本编译，不导入 Tiptap、React 或 DOM。
- 新文字和普通粘贴中的双括号保持字面值；单独的「导入旧模板文本」动作才解析旧语法。残缺旧引用保留为错误节点，保存与生成阻断，可重新选择、删除或显式转普通文字。
- 编辑器保留 React 本地实例，通过同步 handle 在保存、切模式和切模板前读取最新 JSON；对话框使用 ProseMirror 选区恢复；编辑器仅在编辑模式懒加载。
- 服务端 CRUD、种子和草稿生成均使用 bodyJson；兼容 body 只由 AST 派生供读取。写入严格 XOR，旧 body-only PATCH 在核验所有权和 revision 后返回 409；不会把兼容投影重新解析。
- 生成从 AST 一次输出 text，正常文字和本次填写内容不作二次变量替换；原有来源、版本、ownership、范围覆盖与缺项阻断保留。旧显式附加 dataRequirements 在编辑正文时继续保留。
- 迁移 5 在既有事务和 advisory lock 中将唯一正文列 body 从 TEXT 改为 JSONB，逐批转换旧文本，保留业务元数据。不存在并行可修改的第二正文列。
- 文档预算为 2 MiB UTF-8、30,000 字符投影、40,000 节点、16 层，先迭代检查后递归；模板 POST/PATCH 请求 3 MiB、preview 6 MiB，其他路由仍为 1 MiB。文档超限 400、传输超限 413。未知错误日志不序列化原始 err、PG detail 或 message。

## 自动检查

| 实际命令 | 结果与范围 |
| --- | --- |
| pnpm test | 通过：后端普通测试 36 项，数据库集成 14 项按环境跳过；前端 28 项通过。 |
| pnpm test:prompts（真实浏览器问题修复后） | 前端增至 31 项全部通过，保留全部原回归；前端 typecheck、check:ui 和 build 再次通过。 |
| pnpm test:local | 通过：隔离 dongxuan_test 中全部后端 50 项，包括既有 API 10 项和新增富文本集成 4 项。 |
| pnpm typecheck | DTO、服务端、前端全部通过；前端自动运行 pnpm check:ui，业务代码统一控件检查通过。 |
| pnpm build | DTO、服务端和前端构建通过；生成独立 prompt-editor 懒加载 chunk，约 412.43 kB（gzip 132.34 kB）。原主包仍有 Vite 超过 500 kB 的体积提示。 |
| node apps/server/scripts/local-env.mjs test src/v2/prompt-richtext.integration.test.ts | 在强化跨批次回滚和 PATCH/其他路由传输预算用例后再次通过，4 项全部成功。 |

前端测试保留上一轮全部 14 项 service 回归，新增至 31 项：真实 Tiptap JSON、粗斜体/标题/列表/硬换行、普通括号与内部富文本粘贴、实际 copy 事件的中文 text 与稳定 name HTML、原子删除/撤销/重做、实时标签改名不改变 JSON/选区、HTML 资源和属性清理、错误节点转文字、编辑预算、React 选区桥接，以及同步 flush、JSONB 键序、附加资料要求和显式导入。

模型测试另覆盖严格字段/版本/节点/marks/XOR、literal 与 atom 的不同语义、只编译一次、旧文 Markdown/Unicode/连续空行/尾部 LF、错误引用、未知引用、列表文本规则、深度/循环/节点数/字数/字节预算，以及 4 份完整种子模板的输出等价。

## 迁移与接口证据

新增数据库测试使用独立临时 schema 构造旧版 TEXT 结构，不回退公共数据库：

1. 导入 4 份原框架、含 Unicode/CRLF/空行/尾部 LF 的普通文本、未知引用、102 份跨批次文本，以及最后一份错误旧引用。
2. 在最后一份正文更新时注入触发器异常，前一个 100 条批次已经执行；断言整笔回滚后 body 仍为 TEXT、正文及所有元数据逐项一致、迁移 5 标记不存在。
3. 移除注入故障后成功迁移，断言 id、账号、title、revision、字段定义、显式资料要求和微秒级时间戳完全一致；正文为版本 1 JSON 对象，换行规范化外原文保留，4 份框架生成等价，残缺引用以错误节点保留。
4. 再次运行迁移，逐项断言记录不变，body 类型仍为 JSONB。

接口集成使用独立测试账号并清理本次创建数据，验证 JSONB 实际对象存储、兼容投影、literal 双括号生成、旧创建入口转换、双正文拒绝、body-only PATCH 的 409、空正文/错误节点/未知引用/未知版本拒绝。

22,000 个交替 bold/italic 单字 text 节点组成约 1.19 MiB 的合法文档，真实 POST、PATCH、draft preview 全部成功；30,000 个双 marks 节点超过 2 MiB 时返回 400。模板 POST/PATCH 超 3 MiB、preview 超 6 MiB，以及其他路由超原 1 MiB 时均返回 413。

## 本地运行状态

已使用项目脚本校验并停止旧本地进程，再执行：

    node apps/server/scripts/local-env.mjs migrate
    node apps/server/scripts/local-env.mjs background

仅迁移本地 PostgreSQL 127.0.0.1:55439 / dongxuan_dev。确认 schema_migrations 为 1–5、prompt_templates.body 为 JSONB，迁移后的既有 9 份模板全部为 object / schemaVersion 1；API 3041 的 /health 返回 {"ok":true}。前端验收使用既有 5194 页面代理该 API。未操作远程数据库，未提交、部署或发布。

## 协调者独立验收

协调者已在真实本地 API 确认：4 份种子模板迁移后的生成结果 SHA-256 全部与基线一致（完整梅花仍按原诊断阻断），原有元数据不变；另 15 项独立接口验收通过，默认使用模式未请求 Tiptap 资源。迁移前哈希和参数见 validation/prompt-richtext-baseline.json。

真实浏览器首轮发现的两项问题已修复，并由协调者复验通过：

- 只打开编辑模式出现虚假未保存状态：Tiptap setEditable 默认发送无文档变化的更新，触发 dataRequirements 重派生。现关闭该无效事件，Service 对相同正文不再重派生，并在引用集合回到保存基线时恢复原 requirements。实际完整流月种子的 React 挂载和键盘撤销回原 AST/requirements/dirty 回归通过，显式附加项继续保留。
- 长正文拉长整页：编辑面桌面限制为 430–520px、手机 320–430px，正文独立滚动，工具栏位于滚动区外保持可见。

复验使用本地真实页面及独立合成账号，在专用模板上执行编辑、保存与生成；该模板已按 revision 删除，返回 204，再次读取为 404。原有种子没有被本次 UI 编辑覆盖。

| 浏览器实际操作 | 结果 |
| --- | --- |
| 打开完整流月旧模板、输入后撤销 | 初入保持「已保存」，打字后变脏，撤销恢复相同 JSON 与已保存状态。原 942px 正文置于 474px 内部滚动区，外层编辑面为 518px。 |
| 中文标签、填写项改名与资料弹窗 | range.label 显示「阳历月份范围」；填写项改名即时更新标签，节点 JSON 与编辑器实例不变。弹窗插入保持原 ProseMirror 位置，取消后恢复选区及编辑焦点。 |
| 原子删除、普通粘贴与旧文导入 | 资料可整体删除、撤销恢复 name。普通 paste 的双括号保持文字，不增加引用。明确旧文导入解析合法引用；残缺引用保存被阻断、revision 不变，转普通文字后保留原片段。 |
| 中文输入、保存、刷新 | 通过浏览器键入中文和 emoji；刷新后标题、列表、粗体、稳定引用 name、新填写项中文名及普通双括号全部恢复，初始状态仍为已保存。 |
| 真实「生成并复制」 | 实际读取剪贴板与预览 text 完全一致，共 1,852 字符；活动资料展开实际月份，普通正文及填写值中的双括号保持字面；没有节点 JSON 或编辑器 HTML。 |
| 390px / 360px 触控视口 | 页面宽度分别为 390 / 360，无页面横向溢出；编辑面分别为 420 / 398px。资料弹窗位于视口内，正文与保存操作可正常滚动访问。 |

独立实现审查最终结论为 **PASS**，无剩余代码阻断，见[完整审查记录](prompt-richtext-review.md)。机器记录见[浏览器检查结果](validation/prompt-richtext-browser.json)；图片均已打开检查：[桌面编辑](validation/screenshots/prompt-richtext-edit-desktop.png)、[手机编辑](validation/screenshots/prompt-richtext-edit-mobile.png)、[手机资料弹窗](validation/screenshots/prompt-richtext-modal-mobile.png)。

验收边界：已覆盖自动化 composition 与保存快捷键保护，以及真实浏览器中文 / emoji 文本输入；未执行操作系统中文 IME 候选窗口流程。移动端为 Orca 触控视口模拟，未宣称实体 iOS / Android 设备验收。本地实现、迁移、独立审查和上述浏览器流程完成；本轮没有生产发布。

## 工具栏位置补充验收

「＋ 插入资料」已从正文标题行移到富文本编辑器工具栏，位于格式组之后，与撤销 / 重做分隔；标题行仅保留旧模板导入。复用原资料弹窗和选区链路，按钮服从禁用、编辑器初始化与 composition 保护。

开发 SubAgent 执行 web typecheck、check:ui、现有 31 项前端回归和 diff --check，全部通过。协调者在真实浏览器点击工具栏入口，插入 range.label 精确落在预先设置的 pos 5，撤销恢复原 JSON；取消弹窗恢复 pos 7 和正文焦点。360px / 390px 视口均无页面横向溢出，工具栏以 68px 高度换行，中文入口可见。本次未保存或覆盖种子正文。

已检查截图：[工具栏桌面](validation/screenshots/prompt-richtext-toolbar-desktop.png)、[工具栏手机](validation/screenshots/prompt-richtext-toolbar-mobile.png)。
