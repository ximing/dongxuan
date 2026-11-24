# 提示词富文本独立审查

审查时间：2026-11-24。审查对象：[富文本与 JSON 方案](prompt-richtext-plan.md)、[交互示意](design/prompt-richtext.html)，以及当前 DTO、模板 CRUD、迁移和生成代码。

最新结论：**方案复审 PASS，独立实现审查 PASS。** 下文保留初审问题、修订和分阶段复核过程。实现结论覆盖代码与已执行的自动化、独立断言；协调者的真实浏览器验收进度见 [实施与验收记录](prompt-richtext-validation.md)，未完成的人工检查不在本审查中冒充通过。

实施审查状态：**PASS，无剩余代码阻断项。** 本审查没有修改业务代码，也未自行运行数据库迁移。

## 初审结论：BLOCKED

中文资料块、版本化 JSON 单一正文、直接从 AST 生成纯文本的方向成立。当前方案存在三处需要先修订的 P1 边界，修订并复审通过后可交给开发 SubAgent。没有要求用户另行确认的产品分歧。

本次只新增审查文档，没有修改业务代码，也没有运行数据库迁移。

## P1-1：旧残缺引用与新版普通文字目前无法区分

方案同时要求：

- 旧正文中不完整的双括号保留为普通文字，并继续显示旧语法诊断。
- 新版 text 节点中的双括号是字面内容，不能当作活动引用解析。

例如旧正文「说明 {{input.action」迁移后，与用户新键入的同一段普通文字会得到同样的 text 节点。没有额外的节点语义，生成器不可能知道前者应阻断、后者应原样输出。若恢复对全部 text 的正则检查，又会破坏新版字面文字规则。

现有依据：[templateChecks](../apps/server/src/v2/prompt-engine.ts#L5) 会检查残缺括号；[模板写入入口](../apps/server/src/v2/routes.ts#L49) 当前会拒绝此类模板。因此正常旧 API 写入的数据通常不会有这个问题，但方案既然承诺接纳异常历史文本，就必须定义可追踪的导入语义。

**建议修订：** 增加白名单内联错误原子节点，例如 promptInvalidVariable，属性为 raw 与受限 reason。仅明确的旧文本转换入口产生该节点；raw 原样保留，节点在编辑时显示「待修复引用」，保存/生成按明确策略阻断。删除、修复或显式转为普通文字后，诊断随节点一起消失。未知但语法合法的 name 仍是 promptVariable，由目录校验报告未知引用。避免采用编辑后容易过期的文档级字符范围诊断。

**通过条件：**

1. 方案明确错误节点的持久化、修复方式、是否允许保存以及生成阻断规则。
2. 回归样例区分「旧残缺引用节点」与「新版普通 text 中相同字串」。
3. 修复/删除错误节点后能解除诊断，不需要重新导入全文。

## P1-2：兼容 body 是有损投影，不能据此认定两个正文一致

下面两个 JSON 的活动引用语义不同：

- 普通 text 节点的字串「{{range.label}}」。
- name 为 range.label 的 promptVariable 节点。

若把变量节点投影成旧格式，两者的 body 都是「{{range.label}}」。仅比较 body 是否等于 JSON 的文本投影，不能证明两个正文具有相同含义；把读回 body 再走旧解析也会将普通文字升级成资料引用。

这不意味着必须删除只读兼容 body，但它不能再成为写入、变量提取、验证、dirty 或生成的来源。现有 [templateNames / validateTemplate](../apps/web/src/pages/prompts/prompt-model.ts#L13)、[save](../apps/web/src/pages/prompts/prompts.service.ts#L244) 和服务端 templateChecks 都依赖字符串，应明确列入升级范围。

**建议修订：**

- 写 DTO 采用严格互斥的 bodyJson / legacy body 分支，双传一律拒绝，不做投影相等判断。
- 读 DTO 的 body 明确只是展示/兼容导出，不承诺可无损再导入；JSON 记录的业务链路只使用 bodyJson。
- 旧解析只在明确的 legacy 创建/草稿/导入入口运行一次。
- 普通富文本粘贴优先恢复合法资料节点标记，普通 text 不扫描双括号。旧占位符导入采用明确的专用动作或粘贴模式；不能在任何粘贴后扫描全部 text，否则内部复制的字面括号会改变语义。
- 无法恢复节点身份的纯文本复制结果保持普通文字，不根据中文标签猜测 name。

**通过条件：**

1. 新方案写清 API 判别与粘贴入口，不存在两个可独立写入的正文。
2. 普通「{{range.label}}」在没有命盘与月份输入时仍可字面输出；真正的变量节点仍要求相应资料。
3. 字面括号在保存、刷新、复制与普通粘贴后保持普通文字；只有显式旧模板导入会转换。
4. 填写值中含「{{input.action}}」时仍单次输出，不重新进入解析器。

## P1-3：2 MiB 文档预算超过当前 HTTP 请求上限

当前 [buildApp](../apps/server/src/index.ts#L23) 没有设置 bodyLimit。实际已安装 Fastify 运行时的 initialConfig.bodyLimit 为 1,048,576 字节（已用本机实例读取核对）。因此方案允许的合法 JSON 可能在 DTO 校验前被拒绝。

此外，[错误处理](../apps/server/src/index.ts#L40) 当前将非 AppError / ZodError 的异常统一改为 500，超限请求也可能只显示「服务器出错」。单纯把 Zod 限制设为 2 MiB 不能解决问题。

**建议修订：** 为模板创建/PATCH 和预览草稿分别定义请求总预算。预算涵盖 JSON 文档、字段定义、question 与全部 inputValues，而不仅是 bodyJson。可采用模板写入 3 MiB、含 draft 的预览 6 MiB 这样的受限路由预算，或计算出其他覆盖所有合法字段组合的数值；原有单字段与文档预算仍保留。对已识别的请求过大错误返回明确的 413 与中文信息，不映成 500。

**通过条件：**

1. 方案给出精确总请求预算和生效路由，不能只说「适当增大」。
2. 集成测试覆盖大于旧 1 MiB、但在新文档与总请求预算内的合法请求。
3. 文档超限和整体请求超限分别返回确定错误；输入正文不写入错误日志。

## P2：实施约束应补充到方案与验收

### StarterKit 必须与 DTO 白名单一致

本机参考编辑器的 StarterKit 默认实际注册了 blockquote、code、codeBlock、horizontalRule、link、strike、underline、trailingNode 等本方案未允许的能力。仅隐藏工具栏不能阻止快捷键或粘贴产生这些节点/marks。

需明确逐项关闭非白名单能力，限制 heading 为 1–3，并检查 trailingNode 不会在载入/输入时额外追加空段落。dropCursor、gapCursor、undoRedo、listKeymap 等纯行为扩展可保留，只要不产生未声明内容。

应以编辑器真实 getJSON 的样例验证 DTO 接受度，覆盖回车、列表嵌套、粗斜体、撤销、粘贴，而不只测试手写 JSON。

### 中文显示应覆盖目录和右侧填写项

当前 [关联资料侧栏](../apps/web/src/pages/prompts/prompt-editor.tsx#L32)、[填写项 key](../apps/web/src/pages/prompts/prompt-editor.tsx#L44) 和[插入目录](../apps/web/src/pages/prompts/prompt-dialogs.tsx#L33) 都永久显示内部名称或双括号。若只替换正文，用户仍会在编辑过程持续看到原始变量语法。

建议首层统一显示中文名称、来源、是否必填/待接入等信息；内部 key 放在 tooltip 或展开的资料详情中。相同中文名称的不同来源仍需能通过来源或详情区分，不能用 label 建立身份。

### 旧正文与编辑状态需要精确的等价口径

旧正文 CRLF 规范化、引用内部空格归一化与其余原文逐字保留应分别说明。建议把旧正文导入为一个包含 hardBreak 的段落，避免按段落自动重排连续空行和末尾换行。

开发验收至少包含：

- 原有三份完整分析框架与纯文本无变量模板的迁移前后生成等价。
- 连续空行、末尾换行、中文、emoji、引号、反斜杠和双括号值。
- migration 5 重跑、错误注入回滚；id、revision、时间戳、用户与种子信息不变。
- JSONB 对象键重排不会导致 dirty，真正的节点顺序/文字变化会导致 dirty。
- 存储/传输预算在递归 schema 验证前由有界遍历检查，避免先发生栈溢出。
- 保存、切换模式和切换模板同步取得最新编辑内容，中文 composition 不触发保存快捷键。
- 资料对话框恢复选区；输入时不重复 setContent、不重建 editor；编辑器懒加载不进入默认使用路径。

## 已认可的部分

- name 保存稳定身份，label 从目录/字段定义解析。
- 只有资料节点取数，AST 一次遍历生成，不递归解析用户填写值。
- 继承现有来源、所有权、版本、诊断和覆盖范围检查。
- JSON 作为数据库唯一正文，维护窗口一次升级、事务失败回滚，不承诺新旧服务并发写。
- 草稿、来源与预览状态沿用上一轮设计；最终复制保持 text。
- HTML 示意已经明确是原生可编辑区域，并非正式 Tiptap 实现。其原生粘贴、撤销等行为不能替代后续真实编辑器验收。

## 下一步

协调者将上述三项 P1 和实施约束收敛到正式方案后，请本审查 SubAgent 复审。复审 PASS 前不开始业务开发。

## 复审结论：PASS

复审时间：2026-11-24。已逐项核对正式方案的修订，三项 P1 均已消除，没有剩余的方案阻断项，可以交给开发 SubAgent。

| 初审项 | 修订后的明确约束 | 结论 |
| --- | --- | --- |
| P1-1 旧错误与字面文字歧义 | promptInvalidVariable 保存 raw / reason；迁移记录和编辑草稿允许存在，CRUD 保存与生成阻断；删除、修复或显式转普通文字后解除诊断 | 已解决 |
| P1-2 投影与正文双源 | 写 DTO 严格互斥；body 只作只读兼容投影；JSON 的校验、变量提取、dirty、生成和保存只用 bodyJson | 已解决 |
| P1-2 普通粘贴误解析 | 普通输入和普通粘贴不扫描括号；只有独立「导入旧模板文本」调用旧解析；内部富文本按合法节点标记恢复身份 | 已解决 |
| P1-3 传输预算不匹配 | 模板 POST/PATCH 为 3 MiB，预览为 6 MiB；文档仍限 2 MiB；超文档预算 400，超请求预算 413，禁止映成 500 | 已解决 |
| P2 StarterKit 白名单 | 已逐项关闭额外节点/marks 和 trailingNode，heading 限 1–3，要求真实 getJSON 兼容测试 | 已收敛 |
| P2 中文展示 | 正文、侧栏、填写项与插入目录均以中文为默认，内部 key 移入提示或详情 | 已收敛 |
| P2 精确迁移与状态 | 单段 hardBreak 保留原文；明确 CRLF / 引用内部空格口径；规范化 JSON 键序，保存与切换同步 flush；补齐事务、错误注入和真实编辑器测试 | 已收敛 |

### 开发与最终验收约束

1. 将结构验证与业务可保存性分开。迁移读回和编辑器必须能承载 promptInvalidVariable，保存/生成再做明确的语义阻断；不能在响应 DTO 解析时直接丢弃这类历史记录。
2. 以两个 JSON 为固定反例测试：字面 text「{{range.label}}」与真正的 range.label 原子节点。即使兼容 body 相同，取数、校验和最终输出也必须不同。
3. 普通复制粘贴保留字面文字；节点 HTML 中的 label 不可信，只能根据经验证的 name 显示目录名称。纯文本丢失节点身份后保持普通文字。
4. 所有模板写入，包括 seed、旧创建、预览草稿和新 PATCH，都经过统一规范模型；不得遗漏某一路径继续直接向 jsonb 写旧字符串。
5. 迁移只在已确认的隔离本地库执行。必须证明重跑幂等、失败回滚、正文以外元数据不变，不能为方便测试改远程数据库。
6. 除模型纯函数测试外，必须检查真实 Tiptap 输出、资料块键盘操作、中文 composition、弹窗选区恢复、未保存草稿和旧预览失效。示意 HTML 的原生编辑行为不计作真实编辑器验收。
7. 3/6 MiB 是完整请求预算，2 MiB 是文档预算。测试应覆盖两者的边界和错误码，并保留现有输入字段限制。

以上是实施必须遵守的既定边界，不是新增审批步骤。开发与最终验收完成后，再对实现进行独立检查。

## 实施审查第一阶段：共享模型与 DTO

时间：2026-11-24。范围仅限 [prompt-document.ts](../packages/dto/src/prompt-document.ts) 与 [v2.ts](../packages/dto/src/v2.ts) 的提示词契约。前后端正在开发，本阶段不评价未完成代码。

结论：**未发现 P1，可继续实施；整体审查仍进行中。**

### 已核对的实现

| 项目 | 观察 |
| --- | --- |
| AST 一次输出 | text 原样连接，只有 promptVariable 查找 values；替换值不再进入解析器 |
| 字面 / 活动 / 错误引用 | 三种语义分别由 text、promptVariable、promptInvalidVariable 表达；错误节点保留 raw，生成函数明确抛错 |
| 旧文转换 | 独立 importLegacyPrompt 转换；CRLF 规范化，单段 hardBreak 保留连续空行与末尾换行 |
| 前置预算 | 先迭代检查结构、循环/重复对象、深度、节点数和文字预算，再 JSON 序列化字节检查与递归克隆 |
| 白名单 | 节点、子节点关系、attrs、marks 与版本均显式校验；label 等额外属性不能伪造变量身份 |
| 规范化 | marks 去重排序，合并同格式相邻 text；已知的有序列表默认 HTML type:null 被规范化移除 |
| JSONB 相等 | 对象键顺序不影响比较，节点数组按索引比较 |
| 写入口 | bodyJson / legacy body 在运行时严格二选一；规范化输出只包含 bodyJson，剥离只读 body |
| 显式资料要求 | dataRequirements 在 DTO 规范化后仍保留，需由后端与节点引用一起核验 |

### 独立断言

已对开发者构建的 DTO 产物运行额外内存断言，退出码 0：

- 字面「{{range.label}}」与同名变量节点可产生相同兼容投影，但前者变量集合为空且直接输出，后者只输出 values 中对应值。
- values 中的「{{input.action}}」保持字面字符串，未进行二次替换。
- 旧残缺括号保留为错误节点并阻断生成，普通 JSON text 不经过旧解析器。
- 旧 Markdown 字符、中文、连续空行和末尾换行在生成比较中保留。
- 额外属性、不支持 marks、伪造 label 与未知版本被拒绝。
- 双正文写入被拒绝；规范化输入保留附加 dataRequirements，并不携带 body。
- 超深、超节点、超文字和超 JSON 字节预算的输入被拒绝。
- 合法的大文档夹具约 1,188,085 bytes，可用于后续验证超过旧 1 MiB 的 HTTP 请求；约 2,130,085 bytes 的夹具被 2 MiB 文档预算拒绝。

本次审查源文件指纹（SHA-256 前 16 位）：

    packages/dto/src/prompt-document.ts  d78688c325cc5904
    packages/dto/src/v2.ts               bc31b6ea1b159efa

### 留给后续阶段的检查

- 结构模型允许空草稿和错误节点是必要的；CRUD 仍须做正文非空、错误节点与未知引用的保存语义检查。
- 所有写入路径、templateRecord、seed 和 buildPrompt 必须只使用规范 JSON，不能在某处继续扫描兼容 body。
- 显式 dataRequirements 不能由只读 body 或中文 label 重新推断，也不能因格式转换而丢失。
- 前端真实 getJSON、粘贴清理与模型白名单必须一致。特别是非空的 HTML 有序列表 type，应在粘贴层明确降级/提示，不能让 onUpdate 异常造成编辑 DOM 与 Service 草稿脱节。
- 迁移事务、HTTP 总预算、400/413、中文输入、选区恢复和实际复制仍待后续实现完成后验证。

## 实施审查第二阶段：后端

时间：2026-11-24。范围为 db/migrate.ts、db/schema.ts、index.ts，以及 v2 的 routes、prompt-engine、prompts、records 和 prompt-seeds。前端仍在开发，本阶段未审前端。

结论：**目前未发现后端 P1；两项 P2 已在审查期间修正。整体实现审查仍进行中，不构成整体验收 PASS。**

### 已核对的实现

| 项目 | 观察 |
| --- | --- |
| migration 5 | 在原有 BEGIN / advisory transaction lock / COMMIT 内把 body 改为 JSONB；分批锁定 JSON 字符串，显式旧文本转换为版本文档，最后添加对象与版本约束并写迁移记录；异常回滚 |
| 迁移元数据 | 数据更新只设置 body；id、user_id、seed_key、revision 和时间戳不被重写；版本记录使已提交迁移重跑跳过 |
| 单一正文来源 | Drizzle body 类型为 PromptDocument JSONB；templateRecord 规范化 bodyJson，再派生只读 body；POST、PATCH、ensureSeeds 均写 JSON 文档 |
| 种子 | 旧种子只在显式旧解析入口转一次；生产种子写入路径得到规范 bodyJson，没有继续向 JSONB 写普通字符串 |
| 保存语义 | templateChecks 检查正文非空、错误 atom、未声明/不支持的活动引用与显式 dataRequirements；合法的普通 text 双括号不触发资料要求 |
| 旧 PATCH 保护 | 严格正文 XOR 后，在事务内先 owner / revision，再对旧 body 返回 TEMPLATE_FORMAT_UPGRADED 409；不再先解析兼容投影中的双括号 |
| 生成 | buildPrompt 仅从 AST 引用与显式 dataRequirements 取数；最终由 renderPromptDocument 一次输出；兼容 body 不参与生成与验证；原 replaceOnce 仅保留旧单元测试调用 |
| 来源完整性 | 现有所有权、模板版本、命盘/快照规则版本、日期、流年与流月覆盖范围检查保留；未接入来源继续产生阻断诊断 |
| 请求预算 | 模板 POST/PATCH 为 3 MiB，预览为 6 MiB；共享文档预算 2 MiB；Fastify 超请求体错误显式映射为 413 |
| 日志 | 未知错误只记录经过限制的 code 与 error name；不再序列化可能携带整行正文的 PostgreSQL message/detail/cause |

### 审查中发现并已修正的 P2

1. 旧 PATCH 曾在检查格式升级前执行旧 body 解析，含字面双括号的兼容投影可能先收到 400。现已把格式升级保护移到 owner / revision 检查之后、正文语义检查之前；有效旧写请求稳定收到 409，不能覆盖 JSON。
2. 通用错误日志曾继续记录原始 err，PostgreSQL 的 detail 可能包含失败行。现已移除原始错误序列化，避免整段提示词进入该日志路径。

两处均已直接复读修订后的源码。开发者正在补充对应 API / 迁移测试；尚未完成的测试不单独作为本阶段代码阻断项。

### 独立验证与剩余边界

已对构建产物执行额外纯函数断言，退出码 0：普通 text「{{range.label}}」不产生取数；即使附带不同的兼容 body，结果不变；错误 atom、空正文、未知活动引用与未知显式要求会产生诊断；用户填写的「<b>{{ziwei.natal}}</b>」只作为文字输出，不触发二次替换。

审查者未执行任何开发库迁移。本地隔离库上的重跑、注入失败回滚、迁移前后元数据与三份原种子生成等价，以及真实 HTTP 400/409/413 边界，仍需在实施结束前查看完成后的测试结果。源码上的事务和错误码路径已核对，但不能替代这些运行证据。

本阶段源文件指纹（SHA-256 前 16 位）：

    apps/server/src/db/migrate.ts        7e70fc204bcccd7d
    apps/server/src/db/schema.ts         4b12bd62f233fbe1
    apps/server/src/index.ts             5f199862970384d9
    apps/server/src/v2/routes.ts         c971d7b8efc9a468
    apps/server/src/v2/prompt-engine.ts  6fce82a3a5e4a78d
    apps/server/src/v2/prompts.ts        2120c8d8fc31ec2b
    apps/server/src/v2/records.ts        fa1e94c9620d9a69
    apps/server/src/v2/prompt-seeds.ts   0047747ded92530e

## 实施审查第三阶段：前端与实际交互

时间：2026-11-24。本阶段检查 RichPromptEditor、extensions / handle、Service、模型、编辑与使用界面、资料对话框及懒加载。结合 [rab-react 技能](/Users/ximing/.codex/skills/rab-react/SKILL.md) 核对 React / Service 边界；没有修改业务文件。

### 已确认的边界

- 编辑器实例和 PM 选区留在 React；Service 只持有一个返回同步 handle 的闭包，没有把编辑器放入响应式状态。页面注册为独立 Service 生命周期，子组件通过 observer 读取状态。
- 原子节点只保存 name；正文、目录、右侧填写项以中文 label 显示，内部 key 位于 title；label 改名只刷新 NodeView，不变更 JSON 和撤销历史。
- StarterKit 节点 / marks 与共享模型一致；普通输入和普通粘贴不扫描双括号。内部 HTML 使用经验证的稳定 name，外部 HTML 去掉脚本、资源、事件、链接和额外格式，明确提示降级。
- save、切换模式与模板前同步 flush；composition 时阻止保存和插入，快捷键检查 native isComposing / 229；compositionend 再发布最终 JSON。
- 资料对话框打开前记住 PM 选区，插入与取消后恢复编辑焦点；使用 NodeSelection / TextSelection 恢复被选中的引用或文字范围。
- 默认使用模式只加载普通使用界面；编辑模块通过 React.lazy 加载，UI barrel 不导出富文本实现，构建产物存在独立 prompt-editor chunk。
- 生成结果用普通 pre 文本渲染，复制只传 preview.text；复制被拒绝时保留全文并允许再次复制或手动选择。

### 独立运行证据

独立执行 `pnpm test:prompts`：当时的 28 项全部通过。另加内存 React / Tiptap 断言通过：合成 composition 完成后发布最新中文正文；label 更新保持 JSON；label 更新后仍可撤销最近一次插入。

JSDOM 不提供真实布局，额外 composition 断言为 Range 补充了空几何方法；它验证事件和模型链路，不证明系统中文输入法、浏览器真实排版或剪贴板授权行为。

### 实际 UI 暴露的问题与修复复核

协调者发现完整旧模板初次打开即显示未保存，正文 JSON 与 API 完全一致。审查者用真实四份 PROMPT_SEEDS 独立复现：前三份种子原有 dataRequirements=[]，相同正文通知触发 Service.change 后被补入派生要求，dirty 从 false 变 true；原始梅花请求不受影响。

更上游的触发点是 mount 时 setEditable 默认发送 update。开发者已关闭该事件，onUpdate 只处理 docChanged，Service 也对相同正文避免重派生；真实完整流月模板挂载、重挂载与 flush 的回归已加入。审查同时要求覆盖「正文修改后 undo 回原文恢复干净」，防止首次真实编辑仍留下派生元数据。

完整旧模板还曾把编辑器撑到约 942px，保存操作远离首屏。现已改为有界高度的 flex 编辑面：格式条与引用操作不随正文滚动，正文在单独 overflow-y:auto 容器内滚动；最终外观由协调者继续浏览器复核。

undo 元数据修复已落地并独立复核：Service 保存原引用集合与 requirements 的元数据基线，回到原引用集合时恢复原顺序并保留显式附加项；显式 metadata 修改、保存、撤销、无草稿刷新与删除填写项同步维护该基线。审查者用全部四份真实种子验证了相同正文、打字往返、新 atom 往返与显式附加要求保留，均通过；再次独立执行前端测试为 **31 / 31 通过**，包含完整流月模板的实际 ProseMirror 键盘 undo。

代码审查目前无剩余阻断。修复后的布局与真实系统输入法效果仍以协调者浏览器验收为准。

## 最终独立实现审查：PASS

方案初审的三项 P1 已在设计和实现中收敛；后端审查的旧 PATCH 错误码顺序、日志正文风险，以及真实 UI 发现的虚假 dirty、undo 元数据和长正文滚动问题，均已修改并核对对应源码及回归。没有剩余的 P1 或需要阻止继续验收的代码问题。

| 证据 | 本审查采用的范围 |
| --- | --- |
| 独立模型 / DTO 断言 | literal / atom / invalid atom 分离、一次编译、XOR、严格属性、键序、显式要求与文档预算通过 |
| 独立后端纯函数断言 | 只从 AST 取数，兼容 body 不参与；错误节点、未知引用和附加要求正确诊断；填写值不二次解析 |
| 独立前端测试 | 修复后 31 / 31 通过，包括真实 Tiptap、React 桥接、完整流月模板挂载与实际键盘 undo |
| 独立额外前端断言 | 合成 composition 最终中文发布、label 更新不影响 JSON / undo；四份真实种子 no-op / 打字 / atom 往返恢复干净，显式附加项保留 |
| 复用开发与协调者证据 | 后端普通测试、隔离 PostgreSQL 事务回滚 / 元数据 / 幂等和预算 API 测试，以及 typecheck / build / check:ui；具体命令与结果见实施与验收记录，审查者另核对了测试源码 |
| 协调者报告的独立基线 | 四份原模板生成 textHash 和元数据全部不变，其中完整梅花仍按原诊断阻断；15 项真实 API 验收通过；默认使用页未请求 Tiptap 资源 |

审查边界与真实风险：

- 合成 composition 与 JSDOM 证明事件和模型链路，不能替代系统中文输入法、触屏键盘或浏览器原生选区的实测；协调者继续记录实际浏览器结果。
- 自动复制仍受浏览器剪贴板授权与用户手势限制；已有再次复制和手动选择全文的明确回退路径。
- 兼容 body 是有意保留的只读、有损投影。外部调用者应使用 bodyJson 编辑；旧 body-only PATCH 返回 409，避免投影重新解析造成正文语义改变。
- 本地迁移与隔离测试结果不代表远程环境已升级；此次审查和开发没有执行远程迁移或部署。

最终前端源文件指纹（SHA-256 前 16 位）：

    apps/web/src/components/ui/RichPromptEditor.tsx         153a2fcc961497a3
    apps/web/src/components/ui/prompt-editor-extensions.ts  87f7f1361f73e8cb
    apps/web/src/components/ui/rich-prompt-editor.css       04db8c65373a45a4
    apps/web/src/pages/prompts/prompts.service.ts           6ca7040a89b76edc
    apps/web/src/pages/prompts/prompt-model.ts              4385d3314daf1a41

PASS 不免除对后续业务改动的复核；若协调者浏览器验收发现新问题，应修复后追加相应检查结果。

## 追加审查：将「插入资料」移入正文工具栏

时间：2026-11-24。用户补充「插入资料没有放到工具栏」。小改方案在开发前已复审通过；实施后再次通过 CodeGraph 核对当前两处 TSX，结论：**PASS，无 P1 / P2 阻断项**。

- [RichPromptEditor.tsx](../apps/web/src/components/ui/RichPromptEditor.tsx:103) 在格式工具与撤销 / 重做之间增加分隔和可见文字「＋ 插入资料」。按钮使用 disabled / editor 就绪状态，并通过 action(onOpenVariables) 保留 composition 与禁用保护。
- [prompt-editor.tsx](../apps/web/src/pages/prompts/prompt-editor.tsx:20) 移除正文标题行的重复入口，只保留「导入旧模板文本」。原有 onOpenVariables、flush、rememberSelection 与焦点恢复链路继续复用，没有新增选区状态或修改正文模型。
- 工具栏继续使用原有 mousedown 默认行为保护与 flex 换行规则；本次没有修改 AST、Service、API 或数据库逻辑。

复用本次实际检查证据：开发者报告 typecheck、check:ui 与前端 31 项测试全部通过。协调者真实浏览器点击工具栏按钮后，range.label 插入原 pos 5，undo 恢复原 JSON；取消弹窗后恢复 pos 7 与编辑器焦点。360px / 390px 下页面宽度均等于视口，工具栏换行为 68px 且不横向溢出；原种子未保存任何改动。审查者独立核对了代码，未重复操作浏览器或改动业务文件。

本次源文件指纹（SHA-256 前 16 位；替代上节对应文件的较早版本）：

    apps/web/src/components/ui/RichPromptEditor.tsx  406fa089f246651f
    apps/web/src/pages/prompts/prompt-editor.tsx     a56e04a7a7bafade
