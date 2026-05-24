import { Link } from 'react-router-dom';
import { useT } from '../../i18n/LangContext';
import { RichText } from '../../components/ui/RichText';

export function FinalCta() {
  const t = useT();
  return (
    <section id="reserve" className="section-final-cta">
      <div className="mx-final">
        <RichText as="h2" className="mx-final-h" k="tx.final.h" />
        <p className="mx-final-p">{t('tx.final.p')}</p>

        <div className="mx-final-ctas">
          <Link to="/signup" className="btn-primary">
            {t('tx.final.cta_primary')}
            <span className="btn-caret">→</span>
          </Link>
          <a href="#faq" className="btn-ghost">{t('tx.final.cta_secondary')}</a>
        </div>

        <div className="mx-final-foot">{t('tx.final.foot')}</div>
      </div>
    </section>
  );
}
