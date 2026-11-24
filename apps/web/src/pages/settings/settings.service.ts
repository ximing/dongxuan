import { Service } from '@rabjs/react';
import type { OidcAccount } from '@dongxuan/dto';
import { changePassword, getOidcAccount } from '@/api/auth';
import { AuthService, authError } from '@/services/auth.service';

export class SettingsService extends Service {
  account: OidcAccount | null = null;
  currentPassword = '';
  newPassword = '';
  message: string | null = null;
  error: string | null = null;

  get auth(): AuthService {
    return this.resolve(AuthService);
  }

  async loadAccount(): Promise<void> {
    try {
      this.account = await getOidcAccount();
    } catch {
      this.account = null;
    }
  }

  setCurrentPassword(value: string): void {
    this.currentPassword = value;
  }

  setNewPassword(value: string): void {
    this.newPassword = value;
  }

  async updatePassword(): Promise<void> {
    this.message = null;
    this.error = null;
    try {
      await changePassword({ currentPassword: this.currentPassword, newPassword: this.newPassword });
      this.currentPassword = '';
      this.newPassword = '';
      this.message = '密码已更新';
    } catch (error) {
      this.error = authError(error, '没有改成');
    }
  }

  async logout(): Promise<boolean> {
    try {
      await this.auth.logout();
      return true;
    } catch (error) {
      this.error = authError(error, '退出失败，请重试');
      return false;
    }
  }
}
