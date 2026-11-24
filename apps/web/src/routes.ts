export const ROUTES = {
  login: '/login',
  home: '/',
  charts: '/charts',
  chart: '/charts/:id',
  meihua: '/meihua',
  prompts: '/prompts',
  settings: '/settings',
} as const;

export const NAV = [
  [ROUTES.home, '紫微斗数'],
  [ROUTES.meihua, '梅花易数'],
  [ROUTES.charts, '命盘'],
  [ROUTES.prompts, '提示词'],
] as const;
