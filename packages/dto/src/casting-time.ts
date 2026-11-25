import { z } from 'zod';
import { CHINESE_HOURS } from './base.js';

export const CASTING_TIME_ZONE = 'Asia/Shanghai' as const;
export const castingDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const [year, month, day] = value.split('-').map(Number), date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= 2100 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, '请选择 1900–2100 年间的有效阳历日期');
export const castingTimeSchema = z.object({ date: castingDateSchema, timeIndex: z.number().int().min(0).max(12), timeZone: z.literal(CASTING_TIME_ZONE).default(CASTING_TIME_ZONE) });
export type CastingTime = z.infer<typeof castingTimeSchema>;

export function currentCastingTime(now = new Date()): CastingTime {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CASTING_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  const hour = Number(part('hour'));
  return { date: `${part('year')}-${part('month')}-${part('day')}`, timeIndex: hour === 0 ? 0 : Math.floor((hour + 1) / 2), timeZone: CASTING_TIME_ZONE };
}
export function castingTimeFromFields(date: string, hour: string): CastingTime | null {
  const parsed = castingTimeSchema.safeParse({ date, timeIndex: hour === '' ? undefined : Number(hour) });
  return parsed.success ? parsed.data : null;
}
export function formatCastingTime(time: CastingTime | null | undefined): string {
  if (!time) return '未记录起卦时间';
  const hour = CHINESE_HOURS[time.timeIndex];
  return `阳历 ${time.date} ${hour.name}时（${hour.range}，北京时间）`;
}
