import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';

const PHASES = ['p1', 'p2', 'p3', 'p4'] as const;

export function HowItWorks() {
  const t = useT();
  return (
    <section id="how" className="section-how">
      <div className="section-head">
        <Eyebrow k="how.eyebrow" />
        <RichText as="h2" className="section-h" k="how.h" />
        <p className="section-lede">{t('how.lede')}</p>
      </div>

      <div className="how-flow">
        {PHASES.map((p, i) => (
          <div key={p} className={`how-phase p${i + 1}`}>
            <div className="how-phase-num">
              <span>{String(i + 1).padStart(2, '0')}</span>
            </div>
            <div className="how-phase-line" aria-hidden />
            <div className="how-phase-body">
              <div className="how-phase-tag">{t(`how.${p}.t`)}</div>
              <h4>{t(`how.${p}.h`)}</h4>
              <p>{t(`how.${p}.p`)}</p>
              <ul>
                <li>{t(`how.${p}.l1`)}</li>
                <li>{t(`how.${p}.l2`)}</li>
                <li>{t(`how.${p}.l3`)}</li>
              </ul>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
