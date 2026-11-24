import { bindServices, observer, useService } from '@rabjs/react';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button, ButtonLink, Input } from '@/components/ui';
import { oidcErrorText } from '@/lib/oidc-error';
import { ROUTES } from '@/routes';
import { AuthService } from '@/services/auth.service';
import { SettingsService } from './settings.service';

const SettingsContent = observer(function SettingsContent() {
  const auth = useService(AuthService);
  const service = useService(SettingsService);
  const navigate = useNavigate();
  const location = useLocation();
  const oidcError = oidcErrorText(new URLSearchParams(location.search).get('oidc_error'));
  const user = auth.user;

  useEffect(() => {
    void service.loadAccount();
  }, [service]);

  return (
    <main className="settings">
      <h1>设置</h1>
      <p>{user?.displayName ? `${user.displayName} · ` : ''}{service.account?.emailSynthetic ? '统一账号没有提供邮箱' : user?.email}</p>
      <section>
        <h2>排盘默认规则</h2>
        <p className="hint">紫微斗数 · 春节年界 · 晚子归次日 · 闰月按实际运限状态分段</p>
        <p className="hint">库内四柱和技能时辰取样的节气四柱分别展示。每张命盘就是一个人。称呼、关系和备注记在盘上，改正出生资料会重算这一张。</p>
      </section>
      <section>
        <h2>统一账号</h2>
        {oidcError ? <p className="banner">{oidcError}</p> : null}
        {service.account?.enabled && service.account.linked ? <p>已绑定统一账号</p> : null}
        {service.account?.enabled && !service.account.linked ? (
          <>
            <ButtonLink variant="default" className="quiet" href="/api/auth/oidc/bind/start?return=%2Fsettings">绑定统一账号</ButtonLink>
            <p className="hint">绑定后可以用同一个统一账号进入东玄。</p>
          </>
        ) : null}
        {service.account && !service.account.enabled ? <p className="hint">这台服务没有打开统一账号登录。</p> : null}
      </section>
      <section>
        <h2>本地密码</h2>
        {service.account && !service.account.hasPassword ? <p>此账号没有本地密码</p> : null}
        {service.account?.hasPassword ? (
          <form onSubmit={(event) => { event.preventDefault(); void service.updatePassword(); }}>
            <label>
              当前密码
              <Input type="password" autoComplete="current-password" value={service.currentPassword} onChange={(event) => service.setCurrentPassword(event.target.value)} required />
            </label>
            <label>
              新密码
              <Input type="password" autoComplete="new-password" minLength={8} value={service.newPassword} onChange={(event) => service.setNewPassword(event.target.value)} required />
            </label>
            {service.error ? <p className="banner">{service.error}</p> : null}
            {service.message ? <p className="hint">{service.message}</p> : null}
            <Button type="submit" variant="primary">更新密码</Button>
          </form>
        ) : null}
      </section>
      <section>
        <Button variant="default" onClick={() => { void service.logout().then((ok) => { if (ok) navigate(ROUTES.login, { replace: true }); }); }}>退出登录</Button>
      </section>
    </main>
  );
});

export const SettingsPage = bindServices(SettingsContent, [SettingsService]);
