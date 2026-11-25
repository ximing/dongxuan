// 用户原始框架的本地版本；不依赖设计稿或开发机路径。
import { promptTemplateInputSchema, type PromptTemplateInput } from "@dongxuan/dto";
export const LEGACY_MEIHUA_REQUEST_BODY = "以下仅为原始请求，东玄尚未计算卦象。\n需要断事：{{input.question}}\n两个数字：{{input.number_a}} 和 {{input.number_b}}\n请先与我确认两数起卦规则、动爻取法和是否加入时间因素，再决定是否起卦。不要将这些原始输入当成已完成的卦例。";
const LEGACY_PROMPT_SEEDS: Array<Omit<PromptTemplateInput, 'bodyJson'> & { body: string;
    seedKey: string;
}> = [
    {
        "seedKey": "action-months",
        "title": "流月行动排期",
        "system": "ziwei",
        "body": "# Role & 推演法则\n你是一位精通紫微斗数的命理分析专家。\n推演法则：**大限为体，流年为纲，流月为应期**。流月本身不决定格局高低，只负责引动原局、大限、流年早已埋下的吉凶象意。\n\n# Input Data\n- 性别与虚岁：{{ziwei.gender_age}}\n- 本命与当前大限排盘：{{ziwei.natal}}\n{{ziwei.decade_current}}\n- 目标流年与流月排盘：{{ziwei.months}}\n- 目标流月区间：{{range.label}}\n- 近期拟定动作：{{input.action}}\n\n# Analysis Framework（严格按以下三步推演）\n\n## 1. 大限与流年定调（体与纲）\n- 简明交代当前大限与目标流年的叠宫关系及核心四化引动，明确今年在【拟定动作】上的整体吉凶基调与主要隐患。\n\n## 2. 流月应期逐月拆解（纯紫微推演）\n- 仅针对我提供的 **[目标流月区间]**，逐月核查：\n  - **叠宫关系**：流月命宫、流月官禄、流月财帛叠入原局/大限/流年的何宫。\n  - **四化引动**：流月天干四化是否引动了原局/大限/流年的**禄、权、科、忌**（重点标出“禄马/权科交会”的顺遂月，以及“双忌/三忌叠并煞星”的凶险应期月）。\n- 以 Markdown 表格汇总每个月的：**月份（农历/公历）｜流月核心叠宫与四化引动｜命理象意（顺遂/变动/口舌/破财/疾厄）**。\n\n## 3. 行动排期建议（现代白话）\n- 结合我的【拟定动作】，直接给出：**最适合推进/签约的月份**、**必须按兵不动或严防口舌合同漏洞的月份**，以及具体的应对策略。\n\n# Constraints\n1. **流月零推算原则（最高红线）**：严禁自行推算斗君、流月宫位及流月天干四化。若上下文未提供完整的流月排盘文本，必须立刻暂停流月分析，提示我补充数据后再继续。\n2. **严禁流水账**：只抓关键的四化引动与叠宫冲突，平淡无奇的月份一笔带过，把篇幅留给吉凶应期月。\n3. **结论有据**：每个月份的吉凶定性必须写明具体引动的星曜与四化。保持客观不要刻意美化或者说好听的。",
        "inputsSchema": [
            {
                "key": "action",
                "label": "近期拟定动作",
                "type": "textarea",
                "required": true
            }
        ],
        "dataRequirements": []
    },
    {
        "seedKey": "decision-years",
        "title": "大限与多年选项比较",
        "system": "ziwei",
        "body": "# Role & 核心原则\n你是一位精通紫微斗数的命理分析专家。\n核心原则：**先盘后事，象意与现实严格解耦**。必须先纯粹基于命盘推导出命主的格局喜忌与运势走势，最后一步再将命盘喜忌映射到用户的现实选项中，严禁用外部行业刻板印象反推命盘。\n\n# Input Data\n- 性别与虚岁：{{ziwei.gender_age}}\n- 排盘文本：{{ziwei.natal}}\n{{ziwei.decades}}\n- 目标流年资料：{{ziwei.years}}\n- 现实问题与备选方案：\n  - 当前状态：{{input.status}}\n  - 选项 A：{{input.option_a}}\n  - 选项 B：{{input.option_b}}\n  - 选项 C：{{input.option_c}}\n- 核心权衡维度：{{input.criteria}}\n\n# Analysis Framework（严格按以下四步推演）\n\n## 1. 命盘喜忌提炼（纯看盘，不谈现实选项）\n- 结合**命、官、财、迁、兄、仆、疾、夫、田**及**生年四化、大限叠宫**，纯粹从命理角度提炼命主在未来 3–5 年的：\n  - **所喜象意**（如：宜动宜静、宜借大势或独立、宜求名或求实利）。\n  - **所忌象意**（如：忌虚财画饼、忌平级合作内耗、忌透支疾厄）。\n\n## 2. 关键流年走势（定变动时机）\n- 逐年拆解 **{{years.label}}** 的流年命宫、官禄、财帛、疾厄及流年四化，判断哪一年是变动应期、哪一年宜守成、哪一年防破耗或健康预警。\n\n## 3. 选项与命盘喜忌映射（落到现实）\n- 逐一将 **选项 A / B / C** 与第 1 步的命盘喜忌、第 2 步的时间节点进行对照，指出每个选项分别顺应了命盘的哪些吉象、触碰了哪些忌煞。\n\n## 4. 最终决策建议（现代白话）\n- 给出明确的**选项优先级排序**、**必须守住的筛选底线**，以及**分年份的行动节奏**。\n\n# Constraints\n1. **严禁幻觉**：严格基于提供的排盘文本推演，不得自行修改星曜与四化。\n2. **禁止行业脑补**：第 1、2 步只谈星曜与四化象意，严禁带入“某行业996/某赛道画饼”等外部假想。\n3. **结论有据**：每个判断必须对应具体宫位与星曜四化。\n4. **信息不足处理**：若我的现实选项描述过于简略、无法完成第 3 步映射，请先完成第 1、2 步的纯看盘推演，再向我追问缺失的现实信息。",
        "inputsSchema": [
            {
                "key": "status",
                "label": "当前状态",
                "type": "textarea",
                "required": false
            },
            {
                "key": "option_a",
                "label": "选项 A",
                "type": "textarea",
                "required": false
            },
            {
                "key": "option_b",
                "label": "选项 B",
                "type": "textarea",
                "required": false
            },
            {
                "key": "option_c",
                "label": "选项 C",
                "type": "textarea",
                "required": false
            },
            {
                "key": "criteria",
                "label": "核心权衡维度",
                "type": "text",
                "required": false
            }
        ],
        "dataRequirements": [],
        "missingPolicy": "允许先完成第 1、2 步纯看盘；现实资料不足时，第 3、4 步必须追问，不生成虚构选项。"
    },
    {
        "seedKey": "meihua-full",
        "title": "梅花完整卦例分析",
        "system": "meihua",
        "body": "使用梅花易数断事\n上卦（外在/环境）：{{meihua.upper}}\n下卦（内在/你自己）：{{meihua.lower}}\n动爻（事态变数）：{{meihua.moving_line}}\n本卦（当前状态）：{{meihua.primary}}\n互卦（发展过程）：{{meihua.mutual}}\n变卦（最终结果）：{{meihua.changed}}\n\n需要断事为：{{input.question}}\n两个数字：{{input.number_a}} 和 {{input.number_b}}\n\n给我完整的分析过程和结果 解卦要客观中立，如果需要什么信息可以再找我要，不要被其他信息干扰",
        "inputsSchema": [
            {
                "key": "question",
                "label": "需要断事的问题",
                "type": "textarea",
                "required": true
            },
            {
                "key": "number_a",
                "label": "第一个数字",
                "type": "integer",
                "required": true
            },
            {
                "key": "number_b",
                "label": "第二个数字",
                "type": "integer",
                "required": true
            }
        ],
        "dataRequirements": []
    },
    {
        "seedKey": "meihua-request",
        "title": "梅花原始起卦请求",
        "system": "meihua",
        "body": LEGACY_MEIHUA_REQUEST_BODY.replace('需要断事：', '起卦时间：{{meihua.time}}\n需要断事：'),
        "inputsSchema": [
            {
                "key": "question",
                "label": "需要断事的问题",
                "type": "textarea",
                "required": true
            },
            {
                "key": "number_a",
                "label": "第一个数字",
                "type": "integer",
                "required": true
            },
            {
                "key": "number_b",
                "label": "第二个数字",
                "type": "integer",
                "required": true
            }
        ],
        "dataRequirements": []
    }
];
export const PROMPT_SEEDS = LEGACY_PROMPT_SEEDS.map(({ seedKey, ...template }) => ({ ...promptTemplateInputSchema.parse(template), seedKey }));
