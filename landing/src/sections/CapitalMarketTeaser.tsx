import { Link } from 'react-router-dom';
import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';

/**
 * Token economics + growth-engine teaser.
 *
 * Owner kept asking "where is the token / liquidity / staking
 * story" — this section is now that story, in three short cards
 * a non-crypto reader can follow:
 *   1. 20 % of every closed deal goes to the $FLOW liquidity pool
 *   2. Money sits on a 14-day safe contract; operator vests
 *      2 %/day + 72 % on day 15 — withdraw whenever
 *   3. 100-level referral + our own AI agents drive traffic; each
 *      new deal deepens the pool
 *
 * No mock numbers, no fake "trending live" widget — that proved
 * confusing. CTA points to /token for the full breakdown.
 */
const CARDS = ['card1', 'card2', 'card3'];

export function CapitalMarketTeaser() {
  const t = useT();

  return (
    <section id="capital-market" className="cm-section">
      <div className="section-head cm-head">
        <Eyebrow k="cm.eyebrow" />
        <RichText as="h2" className="section-h cm-h" k="cm.h" />
        <p className="section-lede cm-lede">{t('cm.lede')}</p>
      </div>

      <div className="cm-cards">
        {CARDS.map((c, i) => (
          <article key={c} className={`cm-card cm-card-${i + 1}`}>
            <div className="cm-card-num">{String(i + 1).padStart(2, '0')}</div>
            <div className="cm-card-h">{t(`cm.${c}_l`)}</div>
            <p className="cm-card-p">{t(`cm.${c}_v`)}</p>
          </article>
        ))}
      </div>

      <div className="cm-cta">
        <Link to="/token" className="btn-ghost outline cm-cta-ghost">
          {t('cm.cta_token')}
          <span className="btn-caret">→</span>
        </Link>
      </div>
    </section>
  );
}
