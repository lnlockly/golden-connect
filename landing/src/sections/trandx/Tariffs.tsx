import { useT } from '../../i18n/LangContext';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { RichText } from '../../components/ui/RichText';

const TIERS = [
  { id: 'free',  price: '$0',    hot: false },
  { id: 'start', price: '$30',   hot: false },
  { id: 'basic', price: '$60',   hot: false },
  { id: 'core',  price: '$100',  hot: true  },
  { id: 'pro',   price: '$200',  hot: true  },
  { id: 'elite', price: '$300',  hot: true  },
  { id: 'vip',   price: '$600',  hot: false },
  { id: 'royal', price: '$1000', hot: false },
];

export function Tariffs() {
  const t = useT();
  return (
    <section id="tariffs" className="section-tariffs">
      <div className="section-head">
        <Eyebrow k="tx.tariffs.eyebrow" />
        <RichText as="h2" className="section-h" k="tx.tariffs.h" />
        <p className="section-lede">{t('tx.tariffs.lede')}</p>
      </div>

      <div className="mx-tier-grid">
        {TIERS.map((tier) => (
          <article key={tier.id} className={`mx-tier${tier.hot ? ' mx-tier--hot' : ''}`}>
            {tier.hot && <span className="mx-tier-flag">{t('tx.tariffs.flag_popular')}</span>}
            <div className="mx-tier-name">{t(`tx.tariffs.${tier.id}.name`)}</div>
            <div className="mx-tier-price">{tier.price}</div>
            <div className="mx-tier-price-sub">{t('tx.tariffs.price_sub')}</div>
            <p className="mx-tier-unlock">{t(`tx.tariffs.${tier.id}.unlock`)}</p>
          </article>
        ))}
      </div>

      <p className="mx-tariffs-foot">
        <RichText as="span" k="tx.tariffs.foot" />
      </p>
    </section>
  );
}
