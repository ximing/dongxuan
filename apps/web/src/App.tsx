import { Navigate, Route, Routes } from 'react-router';
import { ConfirmDialog } from '@/components/ui';
import { ChartPage } from '@/pages/chart';
import { ChartsPage } from '@/pages/charts';
import { HomePage } from '@/pages/home';
import { LoginPage } from '@/pages/login';
import { MeihuaPage } from '@/pages/meihua';
import { PromptsPage } from '@/pages/prompts';
import { SettingsPage } from '@/pages/settings';
import { ROUTES } from '@/routes';
import { Layout } from '@/shell/Layout';
import { RequireAuth } from '@/shell/RequireAuth';

export function App() {
  return (
    <>
      <ConfirmDialog />
      <Routes>
        <Route path={ROUTES.login} element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="profiles" element={<Navigate to="/charts" replace />} />
            <Route path="profiles/:id" element={<Navigate to="/charts" replace />} />
            <Route path="charts" element={<ChartsPage />} />
            <Route path="charts/:id" element={<ChartPage />} />
            <Route path="meihua" element={<MeihuaPage />} />
            <Route path="prompts" element={<PromptsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
      </Routes>
    </>
  );
}
