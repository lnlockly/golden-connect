import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';
import { ChatInline } from '../components/ChatInline';

interface Props {
  onOrder: () => void;
}

const POINTS = ['p1', 'p2', 'p3'];

export function TalkToAgent({ onOrder }: Props) {
  const t = useT();
  return (
    <section id="talk" className="section-talk">
      <div className="section-head">
        <Eyebrow k="talk.eyebrow" />
        <RichText as="h2" className="section-h" k="talk.h" />
        <p className="section-lede">{t('talk.lede')}</p>
      </div>

      <div className="talk-grid">
        <div className="talk-left">
          <ol className="talk-points">
            {POINTS.map((p, i) => (
              <li key={p}>
                <span className="talk-point-num">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h4>{t(`talk.${p}.h`)}</h4>
                  <p>{t(`talk.${p}.p`)}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="talk-alt">
            <div className="talk-alt-label">{t('talk.alt_l')}</div>
            <p>{t('talk.alt_p')}</p>
            <button className="btn-ghost outline" onClick={onOrder} type="button">
              {t('talk.alt_cta')}
            </button>
          </div>
        </div>

        <div className="talk-right">
          <ChatInline />
        </div>
      </div>
    </section>
  );
}
