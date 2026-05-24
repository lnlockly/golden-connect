import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';

const KPIS = [
  { k: 'k1', v: '$12M' },
  { k: 'k2', v: '$1.1B' },
  { k: 'k3', v: '45K' },
  { k: 'k4', v: '7.5%' },
];

const MILES = ['m1', 'm2', 'm3', 'm4'];

export function InvestorCapsule({ onOrder }: { onOrder: () => void }) {
  const t = useT();
  return (
    <section id="investors" className="section-inv">
      <div className="section-head">
        <Eyebrow k="inv.eyebrow" />
        <RichText as="h2" className="section-h" k="inv.h" />
        <p className="section-lede">{t('inv.lede')}</p>
      </div>

      <div className="inv-grid">
        <div className="inv-kpis">
          {KPIS.map((k) => (
            <div key={k.k} className="inv-kpi">
              <div className="v">{k.v}</div>
              <div className="l">{t(`inv.${k.k}`)}</div>
            </div>
          ))}
        </div>

        <div className="inv-miles">
          <div className="inv-miles-title">{t('inv.miles_title')}</div>
          <ol>
            {MILES.map((m, i) => (
              <li key={m}>
                <span className="inv-miles-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="inv-miles-text">{t(`inv.${m}`)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="inv-cta">
        <RichText as="p" className="inv-cta-text" k="inv.cta_text" />
        <div className="inv-cta-row">
          <button className="btn-primary" onClick={onOrder} type="button">
            {t('inv.cta_talk')}
            <span className="btn-caret">→</span>
          </button>
          <a className="btn-ghost outline" href="mailto:partners@goldenConnect.website">
            {t('inv.cta_deck')}
          </a>
        </div>
      </div>
    </section>
  );
}
