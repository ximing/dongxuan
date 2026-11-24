import { NavLink, Outlet } from 'react-router';
import { NAV, ROUTES } from '@/routes';

export function Layout() {
  return (
    <>
      <a className="skip-link" href="#content">跳到主要内容</a>
      <header className="personal-top">
        <div className="personal-top-inner">
          <NavLink to={ROUTES.home} className="personal-brand">
            <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
            <span className="brand-name">东玄</span>
          </NavLink>
          <nav className="personal-nav" aria-label="主导航">
            {NAV.map(([to, label]) => <NavLink key={to} to={to} end={to === ROUTES.home}>{label}</NavLink>)}
          </nav>
          <NavLink className="settings-link" to={ROUTES.settings} aria-label="设置">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-.6 2.3-2 .9-2.1-.7-2 3.5 1.6 1.6v2.8L2.3 15l2 3.5 2.1-.7 2 .9L9 21h4l.6-2.3 2-.9 2.1.7 2-3.5-1.6-1.6v-2.8L19.7 9l-2-3.5-2.1.7-2-.9L13 3Z" /><circle cx="11" cy="12" r="3" /></svg>
            <span>设置</span>
          </NavLink>
        </div>
      </header>
      <div className="personal-content" id="content" tabIndex={-1}>
        <Outlet />
        <footer className="personal-footer"><span>东玄</span><span className="preview-meta">个人排盘与记录</span><span>紫微斗数 · iztro</span></footer>
      </div>
    </>
  );
}
