import { bindServices, observer, useService } from '@rabjs/react';
import { CHINESE_HOURS } from '@dongxuan/dto';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button, ButtonLink, Input } from '@/components/ui';
import { oidcErrorText } from '@/lib/oidc-error';
import { ROUTES } from '@/routes';
import { AuthService } from '@/services/auth.service';
import { LoginService } from './login.service';

const LoginContent = observer(function LoginContent() {
  const auth = useService(AuthService);
  const form = useService(LoginService);
  const navigate = useNavigate();
  const location = useLocation();
  const oidcError = oidcErrorText(new URLSearchParams(location.search).get('oidc_error'));

  useEffect(() => {
    if (auth.user) navigate(ROUTES.home, { replace: true });
  }, [auth.user, navigate]);

  useEffect(() => {
    void form.loadOidc();
  }, [form]);

  return (
    <main className="gate">
      <section className="gate-mark" aria-hidden="true">
        <div className="mini-board">
          {CHINESE_HOURS.slice(0, 12).map((hour) => <span key={hour.index} />)}
          <strong>紫微</strong>
        </div>
      </section>
      <section className="gate-form">
        <h1>东玄</h1>
        <p className="lede">记下出生时间，打开一张紫微斗数命盘。文字和宫位放在一起。</p>
        <div className="mode-switch" role="tablist">
          <Button type="button" role="tab" aria-selected={form.mode === 'login'} onClick={() => form.setMode('login')}>登录</Button>
          <Button type="button" role="tab" aria-selected={form.mode === 'register'} onClick={() => form.setMode('register')}>注册</Button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void form.submit(); }}>
          {form.mode === 'register' ? (
            <label>
              称呼
              <Input value={form.displayName} onChange={(event) => form.setDisplayName(event.target.value)} maxLength={64} />
            </label>
          ) : null}
          <label>
            邮箱
            <Input type="email" autoComplete="email" value={form.email} onChange={(event) => form.setEmail(event.target.value)} required />
          </label>
          <label>
            密码
            <Input type="password" autoComplete={form.mode === 'login' ? 'current-password' : 'new-password'} minLength={8} value={form.password} onChange={(event) => form.setPassword(event.target.value)} required />
          </label>
          {form.error ? <p className="banner">{form.error}</p> : null}
          <Button type="submit" variant="primary" disabled={form.pending}>{form.pending ? '请稍等' : form.mode === 'login' ? '登录' : '注册并进入'}</Button>
        </form>
        {form.oidcEnabled ? (
          <div className="oidc-block">
            {oidcError ? <p className="banner">{oidcError}</p> : null}
            <ButtonLink variant="default" className="quiet" href="/api/auth/oidc/start?return=%2F">使用统一账号登录</ButtonLink>
            <p className="hint">使用管理员已经开通的统一账号。这里不会注册新账号。</p>
          </div>
        ) : null}
      </section>
    </main>
  );
});

export const LoginPage = bindServices(LoginContent, [LoginService]);
