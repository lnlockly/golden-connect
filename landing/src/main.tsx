import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import { LangProvider } from './i18n/LangContext';
import { AuthProvider } from './lib/auth';

import './styles/globals.css';
import './styles/landing-v2.css';
import './styles/landing-v2-part2.css';
import './styles/landing-v2-part3.css';
import './styles/landing-v2-part4.css';
import './styles/landing-v2-part5.css';
import './styles/landing-v2-part6.css';
import './styles/landing-v2-part7.css';
import './styles/landing-v2-part8.css';
import './styles/landing-v2-part9.css';
import './styles/landing-v2-part10.css';
import './styles/landing-v2-part11.css';
import './styles/landing-v2-part12.css';
import './styles/landing-v2-part13.css';
import './styles/landing-v2-part14.css';
import './styles/landing-v2-part15.css';
import './styles/landing-v2-part16.css';
import './styles/landing-v2-part17.css';
import './styles/landing-v2-part18.css';
import './styles/landing-v2-part19.css';
import './styles/landing-v2-part20.css';
import './styles/landing-v2-part21.css';
import './styles/landing-v2-part22.css';
import './styles/landing-v2-part23.css';
import './styles/landing-v2-part24.css';
import './styles/landing-v2-part25.css';
import './styles/account.css';
import './styles/kb.css';
import './styles/trandx-matrix.css';
import './styles/_golden-theme.css';

const ComingSoon = lazy(() => import('./pages/ComingSoon'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const Cabinet = lazy(() => import('./pages/Cabinet'));
const TgLogin = lazy(() => import('./pages/TgLogin'));
import { CabinetOverview } from './components/cabinet/CabinetOverview';
import { CabinetPanel } from './components/cabinet/CabinetPanel';
import { CabinetPlaceholder } from './components/cabinet/CabinetPlaceholder';

function dismissSplash(): void {
  const el = document.getElementById('af-splash');
  if (!el) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.classList.add('af-splash--leaving');
    setTimeout(() => { try { el.remove(); } catch { /* ignore */ } }, 520);
  }));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <LangProvider>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<App />} />
              <Route path="/app" element={<ComingSoon />} />
              <Route path="/app/*" element={<ComingSoon />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/tg-login" element={<TgLogin />} />
              <Route path="/cabinet" element={<Cabinet />}>
                <Route index element={<CabinetOverview />} />
                <Route path="panel" element={<CabinetPanel />} />
                <Route path="refs" element={<CabinetPlaceholder title="Рефералы" subtitle="10-уровневая партнёрская программа" />} />
                <Route path="seats" element={<CabinetPlaceholder title="Мои места" subtitle="Активные бизнес-места и платежи" />} />
                <Route path="earn" element={<CabinetPlaceholder title="Доход" subtitle="Матрица, Matching Bonus, Gift-счёт, Лидерский пул" />} />
              </Route>
            </Routes>
          </Suspense>
        </LangProvider>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>
);

dismissSplash();
