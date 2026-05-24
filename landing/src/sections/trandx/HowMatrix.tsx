import { useT } from '../../i18n/LangContext';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { RichText } from '../../components/ui/RichText';

const CARDS = [
  { n: '01', k: 'biz' },
  { n: '02', k: 'users' },
  { n: '03', k: 'net' },
];

export function HowMatrix() {
  const t = useT();
  return (
    <section id="how-matrix" className="section-matrix">
      <div className="section-head">
        <Eyebrow k="tx.how.eyebrow" />
        <RichText as="h2" className="section-h" k="tx.how.h" />
        <p className="section-lede">{t('tx.how.lede')}</p>
      </div>

      <div className="mx-matrix-grid mx-how-grid">
        <div className="mx-matrix-copy mx-how-copy">
          {CARDS.map((c) => (
            <div key={c.k} className="mx-matrix-row">
              <span className="mx-matrix-n">{c.n}</span>
              <div>
                <h3>{t(`tx.how.${c.k}.h`)}</h3>
                <p>{t(`tx.how.${c.k}.p`)}</p>
                <span className="mx-how-tag">{t(`tx.how.${c.k}.tag`)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
