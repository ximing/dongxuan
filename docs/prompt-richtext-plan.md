# 提示词富文本与 JSON 存储方案

日期：2026-11-24。状态：方案与实现经独立 SubAgent 审查 PASS，开发 SubAgent 已完成，协调者本地接口与浏览器验收通过。记录见[方案及实现审查](prompt-richtext-review.md)和[实施验收](prompt-richtext-validation.md)。

## 结论

模板正文使用轻量 Tiptap 编辑器，资料引用作为行内原子节点，显示中文名称，例如「阳历月份范围」。数据库以带版本的 ProseMirror JSON 为正文唯一来源。最终生成与复制仍返回纯文本。

保持现有「使用模板 / 编辑模板」和填写、结果布局。此次主要改造编辑正文、引用节点、模板契约和存储，不改变命盘计算、范围覆盖、所有权或缺项阻断规则。

[交互示意](design/prompt-richtext.html)用于评审中文资料块、JSON 和纯文本之间的关系，实际编辑器由开发阶段接入 Tiptap。

## 参考 Inwit 的哪些做法

已核对本机 Inwit：

- apps/web/src/components/capture/capture-editor.tsx 使用轻量 Tiptap，React 宿主不随每笔交易整页重绘，编辑器通过 getJSON / getText / focus 与页面逻辑连接。
- packages/doc-schema 将 ProseMirror JSON 与纯文本转换放在共享模型层；编辑视图和最终文本分别处理。
- Inwit 使用 Tiptap 3.31.3 系列。东玄选择一致版本的 core、react、pm、starter-kit，按需添加 placeholder，并锁定相互兼容版本。
- 参考其中文输入、焦点恢复和 JSONB 键顺序问题：不在中文组词中替换内容；对话框关闭后恢复插入位置；JSON 内容比较忽略对象键顺序。

不直接依赖 Inwit 业务包。东玄只实现自己的小型文档模型与资料节点，避免引入媒体、分页、公式、批注和 AI 编辑。

## 用户看到什么

| 内容 | 展示与行为 |
| --- | --- |
| 自动资料引用 | 浅绿色行内资料块「阳历月份范围」「本命文字盘」「当前大限」 |
| 本次填写项 | 浅蓝色行内块，使用当前字段中文名，例如「近期拟定动作」 |
| 待接入资料 | 保留中文名称并标记「待接入」，生成时继续阻断 |
| 已删除 / 未识别引用 | 显示「未识别资料」，提示修复，不能静默转成普通文字 |
| 旧模板中的错误引用 | 显示「待修复引用」错误节点，保留原片段，可重新选择资料、删除或显式转成普通文字 |
| 内部变量名 | 不占据正文；悬停提示或资料详情中可核对 |
| 生成结果 | 实际资料与本次填写替换后的纯文本；复制不携带 JSON 或 HTML |

资料块的名称不可在正文中拆开编辑。支持整体选中、方向键跨过、Backspace / Delete 整体删除、撤销 / 重做，以及包含资料块的文字选择。正常文本仍可连续输入。

工具栏只提供正文、标题、粗体、斜体、无序列表、有序列表、撤销 / 重做与「插入资料」。另在低频位置提供「导入旧模板文本」。继续使用现有侧栏管理填写项。首轮不提供图片、表格、链接、颜色和任意 HTML。

中文优先覆盖整个编辑过程：正文、关联资料侧栏、填写项和插入目录默认都显示中文名称与来源；内部 key 放 tooltip 或展开详情中，不再永久显示双括号语法。重名资料通过来源区分，仍以 name 建立身份。

## 文档模型

数据库保存的正文示例：

    {
      "schemaVersion": 1,
      "doc": {
        "type": "doc",
        "content": [{
          "type": "paragraph",
          "content": [
            { "type": "text", "text": "请分析 " },
            { "type": "promptVariable", "attrs": { "name": "range.label" } },
            { "type": "text", "text": " 内的行动安排。" }
          ]
        }]
      }
    }

节点只保存稳定 name，不把中文 label 存为可信取数依据。自动资料名称从共享变量目录获得，本次填写项名称从 inputsSchema 获得。改字段中文名称不改变 key，正文资料块随之显示新名称。

首轮白名单：

- 块节点：doc、paragraph、heading（1–3）、bulletList、orderedList、listItem。
- 行内节点：text、hardBreak、promptVariable、promptInvalidVariable。
- marks：bold、italic。JSON 拒绝未知节点、未知属性、不合法子节点关系和未知版本。

promptInvalidVariable 是旧文本转换专用的错误原子，属性为 raw 和受限 reason（例如 unclosed、invalid-name、stray-close）。raw 保留旧原片段，不是可执行变量名；普通新 text 允许字面双括号。它能存在于已迁移记录和当前编辑草稿中；模板创建、PATCH 和生成均阻断含此节点的文档，直到用户重新选择合法资料、删除节点，或明确将其转为普通文字。诊断跟随节点本身，编辑后不会留下过期的文档级位置标记。

共享模型放在 packages/dto 的独立模块中：类型、Zod 验证、规范化、旧模板解析、变量提取、纯文本编译。该模块不依赖浏览器 DOM、React、Tiptap 运行时或数据库。

正文的可读模板文本投影保持现有 30,000 字符上限；额外约束 JSON 的 UTF-8 序列化不超过 2 MiB、节点不超过 40,000、深度不超过 16。先用有界迭代检查结构、预算和深度，再进入递归 schema / 编译，不让异常 JSON 消耗无限栈或内存。旧版合法正文（含大量换行）应可迁移，不用过小节点上限截断。

### HTTP 总请求预算

当前 Fastify 默认只有 1 MiB，必须同时调整传输层：

| 路由 | bodyLimit |
| --- | --- |
| POST /api/v2/prompt-templates | 3 MiB |
| PATCH /api/v2/prompt-templates/:id | 3 MiB |
| POST /api/v2/prompt-previews（含 draft） | 6 MiB |

JSON 文档仍单独限制为 2 MiB；路由预算额外容纳字段定义、question、inputValues 和 JSON 包装，其他路由保留原有上限。对已识别的 Fastify 请求过大错误保留 413，返回中文说明，不能被通用错误处理改成 500。文档本身超限使用明确的 400 校验错误。错误日志不写整段正文或填写值。

规范化后再比较内容：对象键顺序不影响 dirty；节点、列表顺序仍严格保留。编辑器实例保留在 React 编辑器宿主，不将 ProseMirror 实例放进响应式深代理。

## 纯文本生成规则

正式生成从 JSON AST 直接遍历：

1. 校验文档结构，提取 promptVariable.name，并结合既有显式 dataRequirements 检查所需来源。
2. 使用原有盘面、时间、所有权、版本及缺项校验，得到经过核验的变量值。
3. text 原样输出，promptVariable 一次性输出变量值；用户填入的字符串不会再次解析或变成节点。
4. 块结构编译为可读纯文本，返回原有 PromptPreview.text、sources、coverage、diagnostics 等。

禁止「先把 JSON 串成带占位符的字符串，再全局正则替换」。否则正常文本中的双括号会被误解析，替换值也可能被二次处理。

| 节点 | 最终 text |
| --- | --- |
| paragraph | 行内文字连接；块之间保留段落换行 |
| hardBreak | 换行 |
| heading | 标题文字单独成段 |
| bulletList | 每个条目前加“- ”，嵌套列表缩进 |
| orderedList | 按 start 和顺序编号，保留缩进 |
| bold / italic | 保留文字，编辑格式不带入 HTML |
| promptVariable | 服务端核验后的完整资料文字 |
| promptInvalidVariable | 阻断，返回待修复引用诊断，不生成可复制文本 |

旧模板的 Markdown 标记按原文字面保留，导入时不重新解释其标题或列表，以保持旧正文及已生成文本语义。已有纯文本预览、来源和复制组件继续使用 text。

## 旧模板与 API 兼容

现有 body 是字符串。新增 DTO 属性 bodyJson 表示上述结构；返回值始终提供 bodyJson，同时保留服务端派生的 body 供旧的只读代码和过渡测试使用。body 是兼容投影，不能与 bodyJson 分别编辑。

新客户端只提交 bodyJson。写 DTO 的 bodyJson 与旧式 body 字符串严格二选一，双传一律拒绝，不能以投影相等为理由接纳。接口只在明确的旧式创建 / 草稿入口将 body 转为 JSON；新式 JSON 中的 text 永不交给旧解析器。

返回值 body 是可能有损的只读兼容投影。文字「{{range.label}}」和活动引用节点可能有相同投影，所以新模型的验证、变量提取、dirty、生成与保存一律只使用 bodyJson，不能把 body 读回后重新导入。内部规范模型与写入口 DTO 分开处理，客户端保存时显式构造 bodyJson 分支，避免传播读 DTO 中两个字段。

对已升级 JSON 的模板，旧式仅 body 的 PATCH 不得默默覆盖富文本格式；返回明确的冲突 / 刷新提示。版本 revision 继续做乐观锁。

旧文转换：

- 规范化 CRLF 为 LF；将全文导入为一个包含 hardBreak 的段落，保留连续空行和尾部换行，不自动拆分/重排段落。
- 用同一轻量解析器把完整的双括号引用转为 promptVariable；内部空格只用于匹配，标识统一取 trim 后的 name。
- 普通文字和硬换行原样建节点；未知引用也保留为节点，界面可见错误，不丢弃数据。
- 不完整括号、孤立闭括号或非法名称保留为 promptInvalidVariable 错误节点，不能作为迁移失败的理由删除模板。合法但未知的 name 保留为 promptVariable，目录校验继续阻断。
- 无资料引用的纯文字模板也有正常 JSON 文档。

引用标记内部空格允许规范化；除此之外的原文（含旧 Markdown 标记）逐字保留。验收口径为：同一变量值下，迁移前后生成文本在换行规范化后完全等价。纯文本、无变量模板同样适用。

seed 插入走同一转换入口；所有 CRUD、templateRecord 和预览草稿入口都使用同一规范化函数。JSON 模板的变量提取基于节点，不能继续依赖 body.matchAll。既有显式 dataRequirements 继续作为附加要求参与校验，不因正文改用 JSON 而静默丢弃。

## 数据库迁移

采用现有版本化 migrate 机制新增迁移 5，将 prompt_templates.body 从 text 转为 jsonb，列名继续是 body。不引入两套可独立修改的正文列。

迁移在当前已有事务与 advisory lock 下执行：

1. 暂停本次部署的写入，先在独立本地库验证。
2. 将旧字符串安全转成 JSON 值；逐批调用共享旧模板转换函数，写入版本化文档对象。
3. 添加 JSON 对象 / 版本 / doc 根节点的基本 CHECK，body 继续 NOT NULL。
4. 仅更新正文格式；id、账号、title、revision、created_at、updated_at、字段定义和种子标记不变。
5. 全部成功后记录版本并提交；中途失败整笔回滚。再次执行不重复迁移。

旧服务直接向 jsonb 列写旧正文会失败，因此采用维护窗口内的单次升级，不宣称支持旧、新服务同时写入。旧式 API 请求由新服务按兼容规则处理。

不执行远程 / 生产迁移。本轮开发在已确认的隔离本地库执行；部署时先备份并停止旧服务，运行迁移再启新服务。回退旧服务需先停写、由 JSON 导出文本再回退，不能直接丢弃本轮编辑内容。

## 编辑、插入与粘贴

- 以 Tiptap inline atom 节点实现资料块；真实身份是 name，显示文字由目录和字段定义实时解析。
- 「插入资料」沿用现有搜索对话框；记录 ProseMirror 选区，关闭对话框后恢复位置并插入节点，不再使用 textarea 字符下标。
- 编辑器内部复制提供携带 name 的 HTML；粘贴时按白名单恢复合法资料节点标记。普通剪贴板文本提供中文标签，无法恢复身份的纯文本保持文字，不根据中文标签猜测 name。
- 普通键入、普通粘贴和内部富文本中的 text 都不扫描双括号。旧占位符转换仅通过独立的「导入旧模板文本」动作完成，替换/导入前显示明确范围；该入口调用旧转换器，不在任意粘贴后扫描全部文档。
- 外部 HTML 只保留白名单基础格式，丢弃危险标签和属性，不加载图片 / 资源，不执行脚本。不支持的粘贴内容需给出文字提示。
- 中文 composition 中不改写文档，不触发保存快捷键。保存、切换模板和退出编辑前同步取得最新 JSON，不能只依赖有防抖的 onUpdate。
- onUpdate 不得引起 setContent 循环；正常输入不重建编辑器、不跳光标。外部切换模板、撤销整份修改才替换文档。
- 在已有统一 UI 目录增加编辑器控件；页面仍用项目统一 Button / Modal，保持 UI 检查约束。编辑器依赖仅在编辑模式懒加载，使用模板与预览不必加载 Tiptap。

StarterKit 必须逐项关闭白名单之外的 blockquote、code、codeBlock、horizontalRule、link、strike、underline 与 trailingNode，并限制 heading 为 1–3；仅隐藏工具栏不够。纯行为扩展可以保留。以编辑器真实 getJSON 验证 DTO 兼容度，覆盖回车、列表、粗斜体、粘贴与撤销，避免载入时偷偷添加尾段落造成 dirty。

## 兼容现有交互

保留上一轮已经实现的：按模板草稿、已保存版使用、保存失败保留、保存中切换、预览待更新状态、过期请求失效、换命盘清空、梅花原始请求与完整卦象区分、来源快照与完整覆盖检查。

将 PromptTemplateInput 拷贝、dirty 判定和副本创建同步升级为 JSON 模型。删除填写项时操作 AST 中对应的引用节点；撤销编辑能够恢复。通过节点 label 的变化刷新显示，不修改节点 identity。

## 审查与开发顺序

1. 产出本方案及示意 HTML。
2. 由独立 SubAgent 审查用户体验、数据模型、迁移、兼容和复制生成；记录问题并修订。存在阻断问题时不开始业务代码开发。
3. 审查通过后，由开发 SubAgent 实现共享模型、迁移、后端与富文本编辑器，并补针对性测试。
4. 协调者验证构建、测试、本地迁移与真实浏览器；必要时再次交给审查 SubAgent 检查实现，修完再交付。

### 工具栏位置补充

将「＋ 插入资料」从正文标题行移入富文本编辑器工具栏，与格式操作放在同一条工具带，和撤销 / 重做分组。标题行仅保留低频「导入旧模板文本」。复用现有资料弹窗、ProseMirror 选区记录与焦点恢复，不改变资料节点或生成规则。禁用和中文 composition 保护继续有效；手机允许工具栏换行，入口保留中文文字，不能造成页面横向溢出。本补充经独立 SubAgent review 后由开发 SubAgent 实施。

## 验收清单

- range.label 在正文内显示「阳历月份范围」，input.action 显示对应中文填写项名称。
- 标签是原子资料块，可跨越、删除、复制粘贴、撤销和重做；手机可点选和正常输入中文。
- 改填写项中文名，已插入节点即时更新标签，保存刷新后引用 key 不变。
- 保存后数据库正文为 JSON 对象；刷新恢复格式和资料节点。请求不能用 label 替代 name 取数。
- 旧模板的正文、空行与引用顺序保留，迁移幂等且失败回滚，不改 revision 和时间戳。
- 旧残缺引用错误节点与新版含相同字串的普通 text 具有不同语义；修复/删除/显式转文字后能解除诊断。
- bodyJson / body 双传拒绝；普通文字的双括号经过保存、刷新和普通复制粘贴后仍是文字，只有显式旧模板导入会转换。
- JSONB 对象键重排不造成虚假的未保存状态；非法节点、结构、预算、未知版本明确拒绝。
- 正常文本及填入值中的双括号不被二次替换；未知引用和未接入来源仍阻断。
- 标题、段落、有序 / 无序列表编译后有确定的可读 text；复制没有节点 JSON 或 HTML。
- 无输入循环 / 光标跳动；中英文输入、资料插入后的选区、弹窗焦点、未保存草稿与旧预览失效均验证。
- 定向模型测试、原有测试、类型检查、构建、本地数据库集成与真实浏览器通过后交付。
- 集成测试包含超过旧 1 MiB 但仍在新预算内的合法请求，以及文档超限 400 / 总请求超限 413；不将 413 变成 500。

## 资料

- [Tiptap schema：原子节点与 renderText](https://tiptap.dev/docs/editor/core-concepts/schema)
- [Tiptap FAQ：复制粘贴中的 parseHTML 与 renderHTML](https://tiptap.dev/docs/guides/faq)
- 本机参考：/Users/ximing/project/mygithub/inwit/apps/web/src/components/capture/capture-editor.tsx、packages/doc-schema/src/blocks.ts。

## 审查记录

初审 BLOCKED 的三项 P1 已按审查意见收敛：错误引用节点、严格互斥写入与专用旧文导入、HTTP 路由预算与 413。原审查 SubAgent 复审结论 PASS，随后开始业务开发。完整过程见[方案审查](prompt-richtext-review.md)。
