const MESSAGES: Record<string, string> = {
  EMAIL_ALREADY_REGISTERED: '邮箱已注册',
  INVALID_CREDENTIALS: '邮箱或密码错误',
  INVALID_TOKEN: '请先登录',
  NO_LOCAL_PASSWORD: '此账号没有本地密码',
  OIDC_EMAIL_EXISTS: '该邮箱已存在，请使用统一账号登录',
  OIDC_PROVISION_FAILED: '暂时无法开通统一账号，请稍后再试',
  VALIDATION: '输入不正确',
  NOT_FOUND: '没有找到',
  INTERNAL: '服务器出错',
};

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? MESSAGES[code] ?? code);
    this.status = status;
    this.code = code;
  }

  static of(status: number, code: string, message?: string): AppError {
    return new AppError(status, code, message);
  }
}
