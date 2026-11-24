import { Service } from '@rabjs/react';
import { getOidcStatus } from '@/api/auth';
import { AuthService, authError } from '@/services/auth.service';

export class LoginService extends Service {
  mode: 'login' | 'register' = 'login';
  email = '';
  password = '';
  displayName = '';
  error: string | null = null;
  pending = false;
  oidcEnabled = false;

  get auth(): AuthService {
    return this.resolve(AuthService);
  }

  setMode(mode: 'login' | 'register'): void {
    this.mode = mode;
    this.error = null;
  }

  setEmail(value: string): void {
    this.email = value;
  }

  setPassword(value: string): void {
    this.password = value;
  }

  setDisplayName(value: string): void {
    this.displayName = value;
  }

  async loadOidc(): Promise<void> {
    try {
      this.oidcEnabled = (await getOidcStatus()).enabled;
    } catch {
      this.oidcEnabled = false;
    }
  }

  async submit(): Promise<void> {
    this.pending = true;
    this.error = null;
    try {
      if (this.mode === 'login') await this.auth.login(this.email, this.password);
      else await this.auth.register(this.email, this.password, this.displayName.trim() || undefined);
    } catch (error) {
      this.error = authError(error, '请求失败');
    } finally {
      this.pending = false;
    }
  }
}
