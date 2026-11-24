import { z } from 'zod';

export const registerInputSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(64).optional(),
});

export const loginInputSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export const chartInputSchema = z.object({
  title: z.string().trim().min(1).max(64),
  calendar: z.enum(['solar', 'lunar']),
  date: z.string().regex(/^\d{4}-\d{1,2}-\d{1,2}$/),
  timeIndex: z.number().int().min(0).max(12),
  gender: z.enum(['男', '女']),
  isLeapMonth: z.boolean().optional(),
});

export const oidcReturnQuerySchema = z.object({
  return: z.string().max(512).optional(),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
export type ChartInput = z.infer<typeof chartInputSchema>;

export type PublicUser = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
};

export type AuthResponse = {
  user: PublicUser;
};

export type OidcStatus = {
  enabled: boolean;
};

export type OidcAccount = {
  enabled: boolean;
  linked: boolean;
  hasPassword: boolean;
  emailSynthetic: boolean;
};

/** 时辰序号与 iztro 一致：0 早子，12 晚子。新盘显式采用晚子归次日，历史盘以保存快照规则为准。 */
export const CHINESE_HOURS = [
  { index: 0, name: '早子', range: '00:00–01:00' },
  { index: 1, name: '丑', range: '01:00–03:00' },
  { index: 2, name: '寅', range: '03:00–05:00' },
  { index: 3, name: '卯', range: '05:00–07:00' },
  { index: 4, name: '辰', range: '07:00–09:00' },
  { index: 5, name: '巳', range: '09:00–11:00' },
  { index: 6, name: '午', range: '11:00–13:00' },
  { index: 7, name: '未', range: '13:00–15:00' },
  { index: 8, name: '申', range: '15:00–17:00' },
  { index: 9, name: '酉', range: '17:00–19:00' },
  { index: 10, name: '戌', range: '19:00–21:00' },
  { index: 11, name: '亥', range: '21:00–23:00' },
  { index: 12, name: '晚子', range: '23:00–24:00' },
] as const;

export function hourByIndex(index: number): (typeof CHINESE_HOURS)[number] | undefined {
  return CHINESE_HOURS.find((hour) => hour.index === index);
}

export type StarView = {
  name: string;
  brightness?: string;
  mutagen?: string;
};

export type PalaceView = {
  index: number;
  name: string;
  heavenlyStem: string;
  earthlyBranch: string;
  isBodyPalace: boolean;
  isOriginalPalace: boolean;
  majorStars: StarView[];
  minorStars: StarView[];
  adjectiveStars: StarView[];
  changsheng12: string;
  boshi12: string;
  jiangqian12: string;
  suiqian12: string;
  decadal: {
    range: [number, number];
    heavenlyStem: string;
    earthlyBranch: string;
  };
  ages: number[];
};

export type ChartSummary = {
  id: string;
  title: string;
  calendar: 'solar' | 'lunar';
  date: string;
  timeIndex: number;
  timeName: string;
  gender: '男' | '女';
  lunarDate: string;
  fiveElementsClass: string;
  createdAt: string;
};

export type ChartView = {
  id: string;
  title: string;
  calendar: 'solar' | 'lunar';
  inputDate: string;
  gender: string;
  solarDate: string;
  lunarDate: string;
  chineseDate: string;
  time: string;
  timeRange: string;
  sign: string;
  zodiac: string;
  earthlyBranchOfSoulPalace: string;
  earthlyBranchOfBodyPalace: string;
  soul: string;
  body: string;
  fiveElementsClass: string;
  palaces: PalaceView[];
  text: string;
  copyright: string;
  createdAt: string;
};
