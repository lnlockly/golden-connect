import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';

const PILLARS = ['p1', 'p2', 'p3', 'p4'];

export function TrustDelivery() {
  const t = useT();
  return (
    <section id="trust" className="section-trust">
      <div className="section-head">
        <Eyebrow k="trust.eyebrow" />
        <RichText as="h2" className="section-h" k="trust.h" />
        <p className="section-lede">{t('trust.lede')}</p>
      </div>

      <div className="trust-grid">
        {PILLARS.map((p, i) => (
          <div key={p} className={`trust-card t${i + 1}`}>
            <div className="trust-card-num">{String(i + 1).padStart(2, '0')}</div>
            <h4>{t(`trust.${p}.h`)}</h4>
            <p>{t(`trust.${p}.p`)}</p>
            <div className="trust-card-proof">{t(`trust.${p}.proof`)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
