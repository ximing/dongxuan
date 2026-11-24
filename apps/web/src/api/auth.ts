import type { OidcAccount, OidcStatus, PublicUser } from '@dongxuan/dto';
import { api } from './client';

export function getMe(): Promise<PublicUser> {
  return api<PublicUser>('/api/auth/me');
}

export function getOidcStatus(): Promise<OidcStatus> {
  return api<OidcStatus>('/api/auth/oidc/status');
}

export function login(body: { email: string; password: string }): Promise<{ user: PublicUser }> {
  return api('/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
}

export function register(body: { email: string; password: string; displayName?: string }): Promise<{ user: PublicUser }> {
  return api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
}

export function logout(): Promise<void> {
  return api('/api/auth/logout', { method: 'POST' });
}

export function getOidcAccount(): Promise<OidcAccount> {
  return api<OidcAccount>('/api/me/oidc');
}

export function changePassword(body: { currentPassword: string; newPassword: string }): Promise<void> {
  return api('/api/me/password', { method: 'POST', body: JSON.stringify(body) });
}
