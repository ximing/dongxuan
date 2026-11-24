import { Service } from '@rabjs/react';
import type { PublicUser } from '@dongxuan/dto';
import { getMe, login, logout, register } from '@/api/auth';
import { ApiError } from '@/api/client';

export class AuthService extends Service {
  user: PublicUser | null = null;
  ready = false;

  constructor() {
    super();
    void this.bootstrap();
  }

  async bootstrap(): Promise<void> {
    try {
      this.user = await getMe();
    } catch {
      this.user = null;
    } finally {
      this.ready = true;
    }
  }

  setUser(user: PublicUser | null): void {
    this.user = user;
  }

  async login(email: string, password: string): Promise<void> {
    const response = await login({ email, password });
    this.user = response.user;
  }

  async register(email: string, password: string, displayName?: string): Promise<void> {
    const response = await register({ email, password, ...(displayName ? { displayName } : {}) });
    this.user = response.user;
  }

  async logout(): Promise<void> {
    await logout();
    this.user = null;
  }
}

export function authError(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
