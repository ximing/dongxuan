import { describe, it, expect } from 'vitest';
import { astro } from 'iztro';
import { ZIWEI_RULES, type ZiweiInput } from '@dongxuan/dto';
import { createFlowOptions, createView } from './index.js';

const input: ZiweiInput = { system: 'ziwei', title: '区间测试', calendar: 'solar', date: '1993-03-01', timeIndex: 8, gender: '男' };
const native = (birth = input) => astro.withOptions({ type: birth.calendar, dateStr: birth.date, timeIndex: birth.timeIndex, gender: birth.gender, fixLeap: true, language: 'zh-CN', config: { ...ZIWEI_RULES, mutagens: {}, brightness: {} } });

describe('native flow selectors', () => {
  it('lists exactly the twelve native periods, defaults to the current lunar year and selects every native layer directly', () => {
    const options = createFlowOptions(input, {}, '2026-11-24');
    const periods = native().decadalList();
    expect(options.decades.map(p => [p.range, p.fromYear, p.toYear])).toEqual(periods.map(p => [p.ageRange, ...p.yearRange]));
    expect(options.currentAge).toBe(34);
    expect(options.defaultStartAge).toBe(26);
    for (const period of periods) {
      const result = createView(input, { mode: 'decadal', startAge: period.ageRange[0] });
      expect(result.decadal?.range).toEqual(period.ageRange);
      expect(result.decadal?.layer.palaceNames).toEqual(period.palaceNames);
      expect(result.decadal?.layer.stars.map(stars => stars.map(s => s.name))).toEqual(period.stars!.map(stars => stars.map(s => s.name)));
      expect(result.decadal?.layer.mutagen).toEqual(period.mutagen);
      expect(result.text.match(/· 本命/g)).toHaveLength(12);
      expect(result.day).toBeUndefined();
    }
    expect(() => createView(input, { mode: 'decadal', startAge: 150 })).toThrow();
    expect(() => createView(input, { mode: 'decadal', startAge: 27 })).toThrow(/原生大限/);
  });

  it('changes years and decades on Spring Festival instead of January 1', () => {
    const before = createFlowOptions(input, { date: '2028-01-25' }, '2028-01-25');
    const after = createFlowOptions(input, { date: '2028-01-26' }, '2028-01-26');
    expect([before.year, before.currentAge, before.defaultStartAge]).toEqual([2027, 35, 26]);
    expect([after.year, after.currentAge, after.defaultStartAge]).toEqual([2028, 36, 36]);
    expect(after.yearDate).toBe('2028-01-26');
    expect(createFlowOptions(input, { year: 2026 }, '2028-01-26').date).toBe('2026-02-17');
  });

  it('exposes leap-month halves with actual solar coverage matching engine day views', () => {
    const options = createFlowOptions(input, { year: 2025 }, '2026-11-24');
    const leap = options.months.filter(month => month.isLeapMonth);
    expect(leap.map(m => [m.part, m.from, m.to])).toEqual([
      ['first', '2025-07-25', '2025-08-08'], ['second', '2025-08-09', '2025-08-22'],
    ]);
    const raw = native().monthlyList(2025, true);
    for (const month of options.months) {
      const item = raw.find(m => m.month === month.month && m.isLeapMonth === month.isLeapMonth && m.part === month.part)!;
      const day = createView(input, { mode: 'day', date: month.from, includeDaily: false, level: 'monthly' }).day!;
      expect(day.monthly.index).toBe(item.index);
      expect(day.monthly.mutagen).toEqual(item.mutagen);
    }
  });

  it('handles childhood, old charts, birth clipping and calendar endpoints without invented ranges', () => {
    const baby = createFlowOptions({ ...input, date: '2025-01-01', timeIndex: 6 }, {}, '2026-11-24');
    expect(baby.defaultStartAge).toBeNull();
    expect(baby.currentStartAge).toBeNull();
    expect(baby.months.every(m => m.from >= baby.minDate)).toBe(true);
    const early = createFlowOptions({ ...input, date: '1901-01-01' }, { date: '1901-01-01' }, '2026-11-24');
    expect(early.year).toBe(1900);
    expect(early.months[0].from).toBe('1901-01-01');
    expect(early.defaultStartAge).toBe(early.decades.at(-1)?.startAge);
    const edge = createFlowOptions({ ...input, date: '2099-12-31' }, {}, '2026-11-24');
    expect(edge.date).toBe('2099-12-31');
    expect(edge.months.at(-1)?.to).toBe('2099-12-31');
    expect(() => createFlowOptions(input, { year: 2200 }, '2026-11-24')).toThrow(/范围/);
  });

  it('uses the native birth year when late zi crosses Spring Festival', () => {
    const late = { ...input, date: '2025-01-28', timeIndex: 12 };
    const options = createFlowOptions(late, { date: late.date }, '2026-11-24');
    expect(options.currentAge).toBe(native(late).horoscope('2026-11-24', 0).age.nominalAge);
    expect(options.currentAge).toBe(2);
    expect(options.minDate).toBe('2025-01-29');
    expect(options.year).toBe(2025);
    expect(createView(late, { mode: 'day', date: options.date, includeDaily: false, level: 'monthly' }).day?.nominalAge).toBe(1);
  });
});
