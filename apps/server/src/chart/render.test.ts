import { describe, expect, it } from 'vitest';
import { renderChart } from './render.js';

describe('renderChart', () => {
  it('builds a twelve-palace text chart from a solar birth', () => {
    const chart = renderChart({
      title: '示例',
      calendar: 'solar',
      date: '2000-08-16',
      timeIndex: 2,
      gender: '男',
    });
    expect(chart.palaces).toHaveLength(12);
    expect(chart.palaces.some((palace) => palace.name === '命宫')).toBe(true);
    expect(chart.palaces.filter((palace) => palace.isBodyPalace)).toHaveLength(1);
    expect(chart.text).toContain('东玄 · 紫微斗数');
    expect(chart.text).toContain('示例');
    expect(chart.text).toContain('命宫');
    expect(chart.text).toContain(chart.fiveElementsClass);
    expect(chart.text).toContain('生年四化');
    expect(chart.solarDate).toContain('2000');
  });

  it('rejects a date that does not exist', () => {
    expect(() =>
      renderChart({
        title: '坏日子',
        calendar: 'solar',
        date: '2000-02-31',
        timeIndex: 0,
        gender: '女',
      }),
    ).toThrow(/invalid/);
  });
});
