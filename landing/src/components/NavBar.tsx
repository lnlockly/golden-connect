import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLang, useT, type Lang } from '../i18n/LangContext';

type NavLink = { href: string; k: string };

const LINKS: NavLink[] = [
  { href: '/#how-matrix', k: 'nav.how' },
  { href: '/#for-who',    k: 'nav.forwho' },
  { href: '/#tools',      k: 'nav.tools' },
  { href: '/#launch',     k: 'nav.launch' },
  { href: '/#faq',        k: 'nav.faq' },
];

const LANGS: { code: Lang; label: string }[] = [
  { code: 'ru', label: 'RU' },
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
  { code: 'pt', label: 'PT' },
  { code: 'vi', label: 'VI' },
  { code: 'uz', label: 'UZ' },
  { code: 'hi', label: 'HI' },
];

export function NavBar() {
  const t = useT();
  const { lang, setLang } = useLang();
  const location = useLocation();
  const isDeepPage = location.pathname !== '/' && location.pathname !== '';
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;

      setScrolled(y > 24);

      if (y < 120 || menuOpen) {
        setHidden(false);
      } else if (dy > 6) {
        setHidden(true);
      } else if (dy < -6) {
        setHidden(false);
      }
      lastY.current = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [menuOpen]);

  return (
    <header
      className={`nav-bar${scrolled ? ' scrolled' : ''}${hidden ? ' hidden' : ''}`}
    >
      <div className="nav-left">
        <a href="/" className="nav-logo" aria-label="GOLDEN_CONNECT">
          <span className="nav-logo-wave" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </span>
          <span className="nav-logo-text">GOLDEN_CONNECT</span>
        </a>

        {isDeepPage && (
          <Link
            to="/"
            className="nav-back-home"
            aria-label={t('nav.back_home')}
            title={t('nav.back_home')}
          >
            <span aria-hidden="true">←</span>
          </Link>
        )}
      </div>

      <nav className={`nav-links${menuOpen ? ' open' : ''}`} aria-label="primary">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
            {t(l.k)}
          </a>
        ))}
        <div className="nav-lang nav-lang--mobile" role="group" aria-label="language">
          {LANGS.map((l) => (
            <button
              key={l.code}
              className={lang === l.code ? 'active' : undefined}
              onClick={() => { setLang(l.code); setMenuOpen(false); }}
              type="button"
            >
              {l.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="nav-right">
        <Link to="/signup" className="nav-cta">
          {t('nav.cta_start')}
        </Link>
        <div className="nav-lang" role="group" aria-label="language">
          {LANGS.map((l) => (
            <button
              key={l.code}
              className={lang === l.code ? 'active' : undefined}
              onClick={() => setLang(l.code)}
              type="button"
            >
              {l.label}
            </button>
          ))}
        </div>
        <button
          className="nav-burger"
          aria-label="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
