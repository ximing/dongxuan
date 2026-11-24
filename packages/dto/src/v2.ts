import { z } from 'zod';
import { chartInputSchema, type ChartView, type ChartSummary, type StarView } from './base.js';
import { importLegacyPrompt, promptDocumentSchema } from './prompt-document.js';

export const SYSTEM_IDS = ['ziwei', 'bazi', 'meihua', 'qimen'] as const;
export type SystemId = (typeof SYSTEM_IDS)[number];
export const ZIWEI_RULES = { yearDivide: 'normal', horoscopeDivide: 'normal', ageDivide: 'normal', dayDivide: 'forward', algorithm: 'default', fixLeap: true, language: 'zh-CN' } as const;
export type ZiweiRules = typeof ZIWEI_RULES;
export type EngineMeta = { engine: string; engineVersion: string; calendarVersion: string; adapterVersion: string; textVersion: string; referenceSha256: string };
export type SystemCapability = { id: SystemId; name: string; status: 'available' | 'input_only' | 'planned'; calculation: boolean; birthDateRange?: { from: string; to: string }; targetDateRange?: { from: string; to: string } };
export const birthProfileSchema = z.object({ calendar: z.enum(['solar', 'lunar']).optional(), date: z.string().regex(/^\d{4}-\d{1,2}-\d{1,2}$/).optional(), timeIndex: z.number().int().min(0).max(12).optional(), gender: z.enum(['男', '女']).optional(), isLeapMonth: z.boolean().optional(), clock: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional() });
export type BirthProfile = z.infer<typeof birthProfileSchema>;
export const ziweiInputSchema = chartInputSchema.extend({ clock: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), system: z.literal('ziwei').default('ziwei') });
export type ZiweiInput = z.infer<typeof ziweiInputSchema>;
export const chartPatchSchema = z.object({ revision: z.number().int().positive(), title: z.string().trim().min(1).max(64).optional(), relation: z.string().trim().max(32).nullable().optional(), remark: z.string().max(10000).nullable().optional(), archived: z.boolean().optional() });
export type ChartPatch = z.infer<typeof chartPatchSchema>;
export type ZiweiNatalResult = Omit<ChartView, 'id' | 'createdAt'> & { solarPillars: string; pillarPrecision: string; birthSolarDate: string; rules: ZiweiRules; engineMeta: EngineMeta };
export type HoroscopeLayer = { name: string; index: number; heavenlyStem: string; earthlyBranch: string; palaceNames: string[]; mutagen: string[]; stars: StarView[][]; range?: [number, number] };
export type ZiweiDayResult = { date: string; nominalAge: number; decadal: HoroscopeLayer; yearly: HoroscopeLayer; age: HoroscopeLayer; monthly: HoroscopeLayer; daily?: HoroscopeLayer; text: string };
export type DateRange = { from: string; to: string; complete: boolean };
export type ZiweiSegment = { id: string; viewId: string; from: string; to: string; lunarLabel: string; lunarRange: DateRange; monthlyRange: DateRange; overlayRange: DateRange; nominalAge: number; repeated: boolean };
export type ZiweiDecade = { name: string; asOfDate: string; fromYear: number; toYear: number; range: [number, number] | null; layer: HoroscopeLayer; text: string };
export const ziweiQuerySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('day'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), includeDaily: z.boolean().default(false), level: z.enum(['decadal','yearly','monthly','daily']).default('monthly') }),
  z.object({ mode: z.literal('months'), startMonth: z.string().regex(/^\d{4}-\d{2}$/), count: z.number().int().min(1).max(12) }),
  z.object({ mode: z.literal('decades'), asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ mode: z.literal('years'), years: z.array(z.number().int().min(1901).max(2099)).min(1).max(12) }),
]);
export type ZiweiQuery = z.infer<typeof ziweiQuerySchema>;
export type ZiweiViewResult = { query: ZiweiQuery; natal: ZiweiNatalResult; day?: ZiweiDayResult; decades?: { current: ZiweiDecade; next: ZiweiDecade }; segments: ZiweiSegment[]; views: Record<string, ZiweiDayResult>; text: string; engineMeta: EngineMeta };
export type ChartSnapshot = { id: string; chartId: string; kind: 'base' | 'view'; baseSnapshotId: string | null; input: ZiweiInput; rules: ZiweiRules; engineMeta: EngineMeta; schemaVersion: number; query: ZiweiQuery | null; result: ZiweiNatalResult | ZiweiViewResult; text: string; provenance: string; createdAt: string };
export type BaseChartSnapshot = ChartSnapshot & { kind: 'base'; result: ZiweiNatalResult };
export type ViewChartSnapshot = ChartSnapshot & { kind: 'view'; result: ZiweiViewResult; query: ZiweiQuery };
export type ChartRecordSummary = ChartSummary & { relation?: string; remark?: string; system: 'ziwei'; archivedAt: string | null; updatedAt: string; revision: number; migrationStatus: 'ready' | 'failed'; migrationError?: string };
export type ChartRecord = ChartRecordSummary & { sourceChartId: string | null; baseSnapshot: BaseChartSnapshot | null };
export type ViewPreview = { previewToken: string; query: ZiweiQuery; result: ZiweiViewResult; text: string; expiresAt: string; fingerprint: string };
export const viewSaveSchema = z.object({ previewToken: z.string().min(1), title: z.string().trim().max(80).optional() });
export const noteInputSchema = z.object({ chartId: z.string().uuid().optional(), snapshotId: z.string().uuid().optional(), body: z.string().trim().min(1).max(30000) }).refine(x => Boolean(x.chartId) !== Boolean(x.snapshotId), { message: '笔记必须关联一张命盘或一份保存的盘面' });
export const notePatchSchema = z.object({ body: z.string().trim().min(1).max(30000), revision: z.number().int().positive() });
export type NoteInput = z.infer<typeof noteInputSchema>;
export type NoteRecord = { id: string; chartId: string | null; snapshotId: string | null; body: string; revision: number; createdAt: string; updatedAt: string };
export const promptFieldSchema = z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/), label: z.string().trim().min(1).max(80), type: z.enum(['text','textarea','integer']), required: z.boolean(), missingPolicy: z.enum(['block','marker']).optional() });
export type PromptField = z.infer<typeof promptFieldSchema>;
export const promptTemplateInputSchema = z.object({
  title: z.string().trim().min(1).max(80), system: z.enum(['ziwei','meihua']),
  body: z.string().min(1).max(30000).optional(), bodyJson: promptDocumentSchema.optional(),
  inputsSchema: z.array(promptFieldSchema).max(16).default([]), dataRequirements: z.array(z.string().max(64)).max(64).default([]),
  missingPolicy: z.string().max(1000).optional(),
}).superRefine((template, context) => {
  if ((template.body !== undefined) === (template.bodyJson !== undefined)) context.addIssue({ code: z.ZodIssueCode.custom, message: '请仅提交 JSON 正文或旧版文本正文中的一个。' });
  if (new Set(template.inputsSchema.map(field => field.key)).size !== template.inputsSchema.length) context.addIssue({ code: z.ZodIssueCode.custom, message: '填写项变量名不能重复' });
}).transform(({ body, bodyJson, ...template }) => ({ ...template, bodyJson: bodyJson ?? importLegacyPrompt(body!) }));
export type PromptTemplateInput = z.infer<typeof promptTemplateInputSchema>;
export type PromptTemplateWrite = z.input<typeof promptTemplateInputSchema>;
export type PromptTemplate = PromptTemplateInput & { body: string; id: string; revision: number; variableSchemaVersion: number; createdAt: string; updatedAt: string };
export const promptPreviewInputSchema = z.object({ templateId: z.string().uuid().optional(), revision: z.number().int().positive().optional(), draft: promptTemplateInputSchema.optional(), bindings: z.object({ chartId: z.string().uuid().optional(), snapshotId: z.string().uuid().optional(), meihuaDraftId: z.string().uuid().optional() }).default({}), asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), months: z.object({ startMonth: z.string().regex(/^\d{4}-\d{2}$/), count: z.number().int().min(1).max(12) }).optional(), years: z.array(z.number().int().min(1901).max(2099)).max(12).optional(), inputValues: z.record(z.union([z.string().max(30000), z.number().finite()])).default({}), question: z.string().max(30000).optional() });
export type PromptPreviewInput = z.infer<typeof promptPreviewInputSchema>;
export type PromptPreview = { text: string; sources: string[]; fingerprint: string; coverage: Array<{ from: string; to: string; label: string }>; templateRevision: number | null; diagnostics: string[] };
export type PromptVariable = { name: string; label: string; source: string; status: 'available' | 'planned' };
export const meihuaDraftInputSchema = z.object({ question: z.string().trim().min(1).max(10000), numberA: z.number().int().safe(), numberB: z.number().int().safe(), chartId: z.string().uuid().nullable().optional() });
export type MeihuaDraftInput = z.infer<typeof meihuaDraftInputSchema>;
export type MeihuaDraft = MeihuaDraftInput & { id: string; status: 'raw'; revision: number; createdAt: string; updatedAt: string };

/** Stable account/filter-bound cursor page; request ?limit=1..100&cursor=... . */
export type ListPage<T> = {items: T[]; nextCursor: string | null; hasMore: boolean};
