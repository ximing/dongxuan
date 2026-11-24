import { observer, useService } from '@rabjs/react';
import { Navigate, Outlet } from 'react-router';
import { ROUTES } from '@/routes';
import { AuthService } from '@/services/auth.service';

export const RequireAuth = observer(function RequireAuth() {
  const auth = useService(AuthService);
  if (!auth.ready) return <main className="splash"><p>东玄 · 正在载入</p></main>;
  if (!auth.user) return <Navigate to={ROUTES.login} replace />;
  return <Outlet />;
});
