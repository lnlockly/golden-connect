import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';

export function HostedOnEliza() {
  const t = useT();
  return (
    <section id="hosted-eliza" className="hosted-section">
      <div className="section-head hosted-head">
        <Eyebrow k="hosted.eyebrow" />
        <RichText as="h2" className="section-h hosted-h" k="hosted.h" />
        <p className="section-lede hosted-lede">{t('hosted.lede')}</p>
      </div>

      <div className="hosted-cards">
        <article className="hosted-card">
          <div className="hosted-card-h">{t('hosted.c1_h')}</div>
          <p className="hosted-card-p">{t('hosted.c1_p')}</p>
          <a
            className="hosted-card-link"
            href="https://docs.elizaos.ai/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('hosted.c1_link')}
          </a>
        </article>
        <article className="hosted-card">
          <div className="hosted-card-h">{t('hosted.c2_h')}</div>
          <p className="hosted-card-p">{t('hosted.c2_p')}</p>
        </article>
        <article className="hosted-card">
          <div className="hosted-card-h">{t('hosted.c3_h')}</div>
          <p className="hosted-card-p">{t('hosted.c3_p')}</p>
        </article>
      </div>

      <div className="hosted-pill-row">
        <span className="hosted-pill">{t('hosted.pill')}</span>
      </div>
    </section>
  );
}
