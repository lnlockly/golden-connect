import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { TgLoginButton } from '../components/cabinet/TgLoginButton';
import '../styles/cabinet.css';

type MenuItem = {
  to: string;
  label: string;
  soon?: boolean;
};

const MENU: MenuItem[] = [
  { to: '/cabinet', label: 'Обзор' },
  { to: '/cabinet/panel', label: 'Панель управления' },
  { to: '/cabinet/refs', label: 'Рефералы' },
  { to: '/cabinet/seats', label: 'Мои места' },
  { to: '/cabinet/earn', label: 'Доход' },
];

/**
 * Cabinet shell — holds auth guard, top header (brand + logout), horizontal
 * menu, and renders the currently-matched sub-route via <Outlet />.
 *
 * Sub-pages (Overview / Panel / etc.) live in components/cabinet/pages/* and
 * mount under /cabinet/* in main.tsx. Keeping the shell thin means any
 * cabinet-wide chrome (notifications, balance pill) changes in one place.
 */
export default function Cabinet() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    document.title = 'TrendeX · Кабинет';
    let el = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', 'robots');
      document.head.appendChild(el);
    }
    const prev = el.getAttribute('content');
    el.setAttribute('content', 'noindex,nofollow');
    return () => {
      if (prev !== null && el) el.setAttribute('content', prev);
    };
  }, []);

  if (isLoading || !isAuthenticated || !user) {
    return (
      <div className="tx-cab">
        <div className="tx-cab-loading">Загрузка…</div>
      </div>
    );
  }

  const tgLinked = user.tg_id != null;
  const userBadge = user.tg_username
    ? `@${user.tg_username}`
    : user.email ?? user.ref_code;

  return (
    <div className="tx-cab">
      <header className="tx-cab-header">
        <Link to="/" className="tx-cab-brand">
          <span className="tx-cab-brand-name">TrendeX</span>
          <span className="tx-cab-brand-sub">Кабинет</span>
        </Link>
        <div className="tx-cab-header-right">
          <span className="tx-cab-user-badge">{userBadge}</span>
          <a
            href="/cabinet/#/dashboard"
            className="tx-cab-full-link"
            title="Открыть полный кабинет: AI-CRM, рассылки, биллинг, профиль"
          >
            🚀 Полный кабинет
          </a>
          {tgLinked ? (
            <span className="tx-cab-tg-pill">TG ✓</span>
          ) : (
            <TgLoginButton mode="link" label="Привязать TG" />
          )}
          <button
            type="button"
            onClick={() => void logout()}
            className="tx-cab-logout"
          >
            Выйти
          </button>
        </div>
      </header>

      <nav className="tx-cab-menu" aria-label="Cabinet sections">
        <div className="tx-cab-menu-scroll">
          {MENU.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/cabinet'}
              className={({ isActive }) =>
                'tx-cab-menu-item' +
                (isActive ? ' tx-cab-menu-item--active' : '') +
                (item.soon ? ' tx-cab-menu-item--soon' : '')
              }
            >
              {item.label}
              {item.soon ? <span className="tx-cab-menu-soon">скоро</span> : null}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="tx-cab-main" key={location.pathname}>
        <Outlet />
      </main>
    </div>
  );
}
