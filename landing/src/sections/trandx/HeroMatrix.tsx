import { Link } from 'react-router-dom';
import { useT } from '../../i18n/LangContext';
import { RichText } from '../../components/ui/RichText';

export function HeroMatrix() {
  const t = useT();
  return (
    <section id="top" className="hero-v2 hero-matrix">
      <div className="hero-matrix-grid" aria-hidden="true" />
      <div className="hero-matrix-glow" aria-hidden="true" />

      <div className="hero-matrix-inner">
        <div className="hero-matrix-eyebrow">
          <span className="hero-matrix-eyebrow-dot" aria-hidden="true" />
          <span>{t('tx.hero.eyebrow')}</span>
        </div>
        <RichText as="h1" className="hero-matrix-h" k="tx.hero.title" />
        <p className="hero-matrix-sub">{t('tx.hero.sub')}</p>

        <div className="hero-matrix-ctas">
          <Link to="/signup" className="btn-primary">
            {t('tx.hero.cta_primary')}
            <span className="btn-caret">→</span>
          </Link>
          <a href="#how-matrix" className="btn-ghost">
            {t('tx.hero.cta_secondary')}
            <span className="btn-caret">↓</span>
          </a>
        </div>

        <ul className="hero-matrix-chips">
          <li><span className="hero-matrix-chip-dot" aria-hidden="true" />{t('tx.hero.chip_1')}</li>
          <li><span className="hero-matrix-chip-dot" aria-hidden="true" />{t('tx.hero.chip_2')}</li>
          <li><span className="hero-matrix-chip-dot" aria-hidden="true" />{t('tx.hero.chip_3')}</li>
          <li><span className="hero-matrix-chip-dot" aria-hidden="true" />{t('tx.hero.chip_4')}</li>
        </ul>
      </div>
    </section>
  );
}
