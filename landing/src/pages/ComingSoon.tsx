import { Link } from 'react-router-dom';
import { WaveBg } from '../components/account/WaveBg';
import { Logo } from '../components/account/Logo';
import { useT } from '../i18n/LangContext';

/**
 * Inactive / coming-soon surface for routes that are temporarily closed
 * (currently `/app` — the dashboard is parked until the agent launchpad
 * spec is locked in). Visually mirrors the account shell so the user
 * doesn't feel lost.
 */
export default function ComingSoon() {
  const t = useT();
  return (
    <div className="af-account">
      <header className="af-acc-header">
        <WaveBg className="af-acc-header-wave" />
        <Link to="/" className="af-acc-brand nav-logo" aria-label="Golden Connect home">
          <Logo />
          <span className="af-acc-brand-wordmark">GOLDEN_CONNECT</span>
        </Link>
      </header>
      <div className="af-coming">
        <WaveBg className="af-coming-wave" />
        <span className="af-coming-eyebrow">{t('coming.eyebrow')}</span>
        <h1 className="af-coming-title">{t('coming.title')}</h1>
        <p className="af-coming-subtitle">{t('coming.subtitle')}</p>
        <div className="af-coming-actions">
          <Link to="/account" className="af-coming-cta">{t('coming.go_account')}</Link>
          <Link to="/" className="af-coming-link">{t('coming.go_home')}</Link>
        </div>
      </div>
    </div>
  );
}
