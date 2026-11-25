import { describe, expect, it } from 'vitest';
import { castingTimeSchema, currentCastingTime, formatCastingTime } from '@dongxuan/dto';

describe('casting time at Chinese-hour precision', () => {
  it('maps every Beijing clock hour and keeps early and late zi on their actual civil dates', () => {
    const expected = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12];
    for (let hour = 0; hour < 24; hour++) {
      const instant = new Date(Date.UTC(2026, 10, 25, hour - 8));
      expect(currentCastingTime(instant)).toEqual({ date: '2026-11-25', timeIndex: expected[hour], timeZone: 'Asia/Shanghai' });
    }
    expect(currentCastingTime(new Date('2026-11-25T15:59:59Z'))).toEqual({ date: '2026-11-25', timeIndex: 12, timeZone: 'Asia/Shanghai' });
    expect(currentCastingTime(new Date('2026-11-25T16:00:00Z'))).toEqual({ date: '2026-11-26', timeIndex: 0, timeZone: 'Asia/Shanghai' });
  });
  it('rejects impossible dates, partial time and unsupported hours or zones', () => {
    const time = { date: '2026-11-25', timeIndex: 8 };
    expect(castingTimeSchema.parse(time).timeZone).toBe('Asia/Shanghai');
    expect(castingTimeSchema.safeParse({ ...time, date: '2000-02-29' }).success).toBe(true);
    for (const value of [{ ...time, date: '1900-02-29' }, { ...time, date: '2026-02-30' }, { ...time, date: '2101-01-01' }, { date: time.date }, { ...time, timeIndex: 13 }, { ...time, timeIndex: 1.5 }, { ...time, timeZone: 'UTC' }]) expect(castingTimeSchema.safeParse(value).success).toBe(false);
  });
  it('formats the supplied precision without inventing minutes or substituting a save timestamp', () => {
    expect(formatCastingTime({ date: '2026-11-25', timeIndex: 12, timeZone: 'Asia/Shanghai' })).toBe('阳历 2026-11-25 晚子时（23:00–24:00，北京时间）');
    expect(formatCastingTime(null)).toBe('未记录起卦时间');
  });
});
