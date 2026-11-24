const TEXT: Record<string, string> = {
  OIDC_DENIED: '统一账号登录被拒绝。若账号已停用，请联系管理员',
  OIDC_UNAVAILABLE: '暂时无法连接统一账号服务，请稍后再试',
  OIDC_SUBJECT: '统一账号没有返回用户标识。请联系管理员检查 basic scope',
  OIDC_AUDIENCE: '统一账号令牌不能用于本系统。请联系管理员检查受众',
  OIDC_EMAIL_CONFLICT: '该邮箱已有东玄账号。请先用邮箱和密码登录，再在设置里绑定统一账号',
  OIDC_EMAIL_INVALID: '统一账号的邮箱无法使用，请联系管理员',
  OIDC_IDENTITY_TAKEN: '这个统一账号已经绑定了另一个用户',
  OIDC_IDENTITY_EXISTS: '当前用户已经绑定了另一个统一账号',
  OIDC_BIND_SESSION: '登录状态已失效，请先登录再绑定',
  OIDC_STATE: '统一账号登录没有完成，请再试一次',
  RATE_LIMITED: '尝试次数太多，请稍后再试',
};

export function oidcErrorText(code: string | null): string | null {
  if (!code) return null;
  return TEXT[code] ?? '统一账号登录没有完成';
}
