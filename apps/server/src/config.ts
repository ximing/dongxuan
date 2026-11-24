import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../.env') });

process.env.PGGSSENCMODE ??= 'disable';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`缺少环境变量 ${name}`);
  }
  return value.trim();
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`环境变量 ${name} 不是正整数`);
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
  throw new Error('NODE_ENV 只能是 development、test 或 production');
}

export const config = {
  NODE_ENV: nodeEnv as 'development' | 'test' | 'production',
  PORT: intEnv('PORT', 3040),
  PG_HOST: required('PG_HOST'),
  PG_PORT: intEnv('PG_PORT', 25432),
  PG_USER: required('PG_USER'),
  PG_PASSWORD: required('PG_PASSWORD'),
  PG_DATABASE: required('PG_DATABASE'),
  PG_SSL: process.env.PG_SSL === 'true',
  WEB_ORIGIN: required('WEB_ORIGIN').replace(/\/$/, ''),
  JWT_SECRET: required('JWT_SECRET'),
  COOKIE_SECRET: required('COOKIE_SECRET'),
  ACCESS_TOKEN_TTL_SECONDS: intEnv('ACCESS_TOKEN_TTL_SECONDS', 900),
  REFRESH_TOKEN_TTL_DAYS: intEnv('REFRESH_TOKEN_TTL_DAYS', 30),
  OIDC_ISSUER: process.env.OIDC_ISSUER,
  OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET,
  OIDC_REDIRECT_URI: process.env.OIDC_REDIRECT_URI,
  OIDC_AUDIENCE: process.env.OIDC_AUDIENCE,
  OIDC_SCOPES: process.env.OIDC_SCOPES,
  OIDC_ADMIN_USER: process.env.OIDC_ADMIN_USER,
  OIDC_ADMIN_PASSWORD: process.env.OIDC_ADMIN_PASSWORD,
};
