import { useT } from '../i18n/LangContext';
import { Eyebrow } from '../components/ui/Eyebrow';
import { RichText } from '../components/ui/RichText';

export function ReferralLayers() {
  const t = useT();
  return (
    <section id="referral" className="section-referral">
      <div className="section-head">
        <Eyebrow k="referral.eyebrow" />
        <RichText as="h2" className="section-h" k="referral.h" />
        <p className="section-lede">{t('referral.lede')}</p>
      </div>

      <div className="referral-strip" aria-hidden="true">
        {Array.from({ length: 100 }).map((_, i) => (
          <span
            key={i}
            className="referral-tick"
            style={{ animationDelay: `${(i % 17) * 60}ms` }}
          />
        ))}
        <div className="referral-strip-label">100</div>
      </div>
    </section>
  );
}
