import { Link } from 'react-router-dom';
import { useT } from '../i18n/LangContext';

/**
 * Five summary cards matching the NavBar items: «Как работает»,
 * «Для бизнеса», «Операторы», «$FLOW», «Инвесторам». Each is a
 * 2–3-sentence teaser with a link to the full sub-page (where the
 * PageChat lets the user dig deeper manually).
 *
 * This section is the spine of the guided tour — every card has
 * an #nav-<id> anchor so the tour can scroll to it in sequence
 * without navigating away from /.
 */
interface Card {
  id: string;          // anchor suffix — #nav-<id>
  route: string;
  num: string;
  tKey: string;        // base i18n key — <tKey>.h / .p / .cta
}

const CARDS: Card[] = [
  { id: 'how',       route: '/how',       num: '01', tKey: 'navsum.how' },
  { id: 'business',  route: '/business',  num: '02', tKey: 'navsum.business' },
  { id: 'operators', route: '/operators', num: '03', tKey: 'navsum.operators' },
  { id: 'token',     route: '/token',     num: '04', tKey: 'navsum.token' },
  { id: 'investors', route: '/investors', num: '05', tKey: 'navsum.investors' },
];

export function NavSummaryCards() {
  const t = useT();
  return (
    <section id="nav-summary" className="nav-summary">
      <div className="section-head">
        <div className="eyebrow">{t('navsum.eyebrow')}</div>
        <h2 className="section-h nav-summary-h">{t('navsum.h')}</h2>
        <p className="section-lede">{t('navsum.lede')}</p>
      </div>

      <div className="nav-summary-grid">
        {CARDS.map((c) => (
          <Link
            key={c.id}
            id={`nav-${c.id}`}
            to={c.route}
            className="nav-summary-card"
          >
            <span className="nav-summary-num">{c.num}</span>
            <h3 className="nav-summary-card-h">{t(`${c.tKey}.h`)}</h3>
            <p className="nav-summary-card-p">{t(`${c.tKey}.p`)}</p>
            <span className="nav-summary-card-cta">
              {t(`${c.tKey}.cta`)}
              <span aria-hidden="true"> →</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default NavSummaryCards;
