import { Link } from 'react-router-dom';
import { useT } from '../i18n/LangContext';

/**
 * Small "back to home" pill rendered at the top of every non-root
 * route page. Lives just under the NavBar, left-aligned, neutral.
 */
export function BackHome() {
  const t = useT();
  return (
    <div className="page-back-home">
      <Link to="/" className="page-back-home-link">
        ← {t('nav.back_home')}
      </Link>
    </div>
  );
}
