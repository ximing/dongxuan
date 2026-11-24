import { hourByIndex, type ChartInput, type ChartView, type PalaceView, type StarView } from '@dongxuan/dto';
import { astro } from 'iztro';

const READ_ORDER = ['巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑', '寅', '卯', '辰'] as const;

type Built = Omit<ChartView, 'id' | 'createdAt'>;

function asStar(value: unknown): StarView | null {
  if (!value || typeof value !== 'object' || !('name' in value)) return null;
  const name = value.name;
  if (typeof name !== 'string' || name.length === 0) return null;
  const brightness = 'brightness' in value && typeof value.brightness === 'string' ? value.brightness : '';
  const mutagen = 'mutagen' in value && typeof value.mutagen === 'string' ? value.mutagen : '';
  return {
    name,
    ...(brightness ? { brightness } : {}),
    ...(mutagen ? { mutagen } : {}),
  };
}

function asStars(value: unknown): StarView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const star = asStar(item);
    return star ? [star] : [];
  });
}

function starName(value: unknown): string {
  if (typeof value === 'string') return value;
  const star = asStar(value);
  return star?.name ?? '';
}

function formatStar(star: StarView): string {
  const brightness = star.brightness ? ` ${star.brightness}` : '';
  const mutagen = star.mutagen ? ` 化${star.mutagen}` : '';
  return `${star.name}${brightness}${mutagen}`;
}

function line(label: string, stars: StarView[]): string | null {
  if (stars.length === 0) return null;
  return `  ${label}  ${stars.map(formatStar).join('    ')}`;
}

function palaceBlock(palace: PalaceView): string[] {
  const marks = [palace.name === '命宫' ? '命' : '', palace.isBodyPalace ? '身' : '', palace.isOriginalPalace ? '来因' : '']
    .filter((mark) => mark.length > 0)
    .join(' ');
  const header = [palace.earthlyBranch, palace.heavenlyStem, palace.name, marks].filter((part) => part.length > 0).join('  ');
  const lines = [header];
  const major = line(palace.majorStars.length === 0 ? '主星' : '主星', palace.majorStars);
  lines.push(major ?? '  主星  空宫');
  const minor = line('辅星', palace.minorStars);
  if (minor) lines.push(minor);
  const adjective = line('杂耀', palace.adjectiveStars);
  if (adjective) lines.push(adjective);
  const spirits = [palace.changsheng12, palace.boshi12, palace.jiangqian12, palace.suiqian12].filter((item) => item.length > 0);
  if (spirits.length > 0) lines.push(`  神煞  ${spirits.join(' · ')}`);
  const [start, end] = palace.decadal.range;
  lines.push(
    `  大限  ${palace.decadal.heavenlyStem}${palace.decadal.earthlyBranch}  ${start}–${end} 岁`,
  );
  return lines;
}

function mutagenSection(palaces: PalaceView[]): string[] {
  const found = new Map<string, string>();
  for (const palace of palaces) {
    for (const star of [...palace.majorStars, ...palace.minorStars, ...palace.adjectiveStars]) {
      if (star.mutagen && !found.has(star.mutagen)) found.set(star.mutagen, `${star.name} 在${palace.name}`);
    }
  }
  const lines = ['生年四化'];
  for (const name of ['禄', '权', '科', '忌']) {
    const where = found.get(name);
    if (where) lines.push(`  ${name}  ${where}`);
  }
  return lines.length === 1 ? [] : lines;
}

function readPalace(value: unknown): PalaceView {
  const palace = value as Record<string, unknown>;
  const decadal = (palace['decadal'] ?? {}) as Record<string, unknown>;
  const range = Array.isArray(decadal['range']) ? decadal['range'] : [0, 0];
  const ages = Array.isArray(palace['ages']) ? palace['ages'].filter((age) => typeof age === 'number') : [];
  return {
    index: typeof palace['index'] === 'number' ? palace['index'] : 0,
    name: typeof palace['name'] === 'string' ? palace['name'] : '',
    heavenlyStem: typeof palace['heavenlyStem'] === 'string' ? palace['heavenlyStem'] : '',
    earthlyBranch: typeof palace['earthlyBranch'] === 'string' ? palace['earthlyBranch'] : '',
    isBodyPalace: palace['isBodyPalace'] === true,
    isOriginalPalace: palace['isOriginalPalace'] === true,
    majorStars: asStars(palace['majorStars']),
    minorStars: asStars(palace['minorStars']),
    adjectiveStars: asStars(palace['adjectiveStars']),
    changsheng12: starName(palace['changsheng12']),
    boshi12: starName(palace['boshi12']),
    jiangqian12: starName(palace['jiangqian12']),
    suiqian12: starName(palace['suiqian12']),
    decadal: {
      range: [Number(range[0] ?? 0), Number(range[1] ?? 0)],
      heavenlyStem: typeof decadal['heavenlyStem'] === 'string' ? decadal['heavenlyStem'] : '',
      earthlyBranch: typeof decadal['earthlyBranch'] === 'string' ? decadal['earthlyBranch'] : '',
    },
    ages,
  };
}

function renderText(chart: Omit<Built, 'text'>): string {
  const byBranch = new Map(chart.palaces.map((palace) => [palace.earthlyBranch, palace]));
  const blocks = READ_ORDER.flatMap((branch) => {
    const palace = byBranch.get(branch);
    return palace ? [...palaceBlock(palace), ''] : [];
  });
  return [
    '东玄 · 紫微斗数',
    chart.title,
    `阳历  ${chart.solarDate}`,
    `农历  ${chart.lunarDate}`,
    `四柱  ${chart.chineseDate}`,
    `${chart.gender}    ${chart.zodiac}    ${chart.sign}    ${chart.fiveElementsClass}`,
    `命主 ${chart.soul}    身主 ${chart.body}`,
    `命宫 ${chart.earthlyBranchOfSoulPalace}    身宫 ${chart.earthlyBranchOfBodyPalace}`,
    `时辰  ${chart.time}（${chart.timeRange}）`,
    '',
    ...blocks,
    ...mutagenSection(chart.palaces),
    '',
    chart.copyright,
  ]
    .filter((lineText, index, all) => lineText.length > 0 || (index > 0 && all[index - 1] !== ''))
    .join('\n');
}

export function renderChart(input: ChartInput): Built {
  const hour = hourByIndex(input.timeIndex);
  if (!hour) throw new Error('invalid timeIndex: expected an integer from 0 to 12.');
  const astrolabe =
    input.calendar === 'solar'
      ? astro.bySolar(input.date, input.timeIndex, input.gender, true, 'zh-CN')
      : astro.byLunar(input.date, input.timeIndex, input.gender, input.isLeapMonth ?? false, true, 'zh-CN');
  const palaces = (astrolabe.palaces ?? []).map((palace) => readPalace(palace));
  const view: Omit<Built, 'text'> = {
    title: input.title,
    calendar: input.calendar,
    inputDate: input.date,
    gender: astrolabe.gender,
    solarDate: astrolabe.solarDate,
    lunarDate: astrolabe.lunarDate,
    chineseDate: astrolabe.chineseDate,
    time: astrolabe.time,
    timeRange: astrolabe.timeRange,
    sign: astrolabe.sign,
    zodiac: astrolabe.zodiac,
    earthlyBranchOfSoulPalace: astrolabe.earthlyBranchOfSoulPalace,
    earthlyBranchOfBodyPalace: astrolabe.earthlyBranchOfBodyPalace,
    soul: astrolabe.soul,
    body: astrolabe.body,
    fiveElementsClass: astrolabe.fiveElementsClass,
    palaces,
    copyright: astrolabe.copyright,
  };
  return { ...view, text: renderText(view) };
}

export function chartFailureMessage(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  if (err.message.startsWith('invalid ')) return '日期、时辰或性别不正确';
  return null;
}
