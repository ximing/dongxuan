import { describe, expect, it } from 'vitest';
import { isSyntheticEmail, redactOidcUrl, resolveOidcConfig, sanitizeReturnTo, syntheticEmail } from './oidc-logic.js';

const base = {
  NODE_ENV: 'development' as const,
  WEB_ORIGIN: 'http://127.0.0.1:5192',
};

describe('resolveOidcConfig', () => {
  it('stays off when every oidc variable is empty', () => {
    expect(resolveOidcConfig(base)).toEqual({ enabled: false, error: false, missing: [] });
  });

  it('stays off and names the missing variables when only some are set', () => {
    const resolved = resolveOidcConfig({ ...base, OIDC_ISSUER: 'https://super-agent-auth.aimo.plus/realms/aimo-plus-test' });
    expect(resolved.enabled).toBe(false);
    if (resolved.enabled) return;
    expect(resolved.error).toBe(true);
    expect(resolved.missing).toContain('OIDC_CLIENT_ID');
  });

  it('rejects the reserved super-agent client', () => {
    const resolved = resolveOidcConfig({
      ...base,
      OIDC_ISSUER: 'https://super-agent-auth.aimo.plus/realms/aimo-plus-test',
      OIDC_CLIENT_ID: 'super-agent-native',
      OIDC_CLIENT_SECRET: '1234567890123456',
      OIDC_REDIRECT_URI: 'http://127.0.0.1:5192/api/auth/oidc/callback',
      OIDC_AUDIENCE: 'dongxuan-api',
    });
    expect(resolved.enabled).toBe(false);
  });
});

describe('return path and synthetic email', () => {
  it('drops off-site return paths', () => {
    expect(sanitizeReturnTo('https://evil.example', base.WEB_ORIGIN)).toBe('/');
    expect(sanitizeReturnTo('/charts/1', base.WEB_ORIGIN)).toBe('/charts/1');
  });

  it('builds a stable placeholder email', () => {
    const email = syntheticEmail('https://issuer.example', 'sub-1');
    expect(isSyntheticEmail(email)).toBe(true);
    expect(email).toBe(syntheticEmail('https://issuer.example', 'sub-1'));
  });

  it('redacts the authorization code', () => {
    const redacted = redactOidcUrl('/api/auth/oidc/callback?code=SECRET&state=SECRETSTATE');
    expect(redacted).not.toContain('SECRET');
    expect(redacted).toContain('[redacted]');
  });
});
