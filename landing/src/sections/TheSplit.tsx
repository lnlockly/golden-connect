import { useEffect, useState } from 'react';
import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';

const PROFESSIONS = ['split.p1', 'split.p2', 'split.p3', 'split.p4', 'split.p5', 'split.p6', 'split.p7', 'split.p8'];

const LEADER_BULLETS  = ['split.leader.b1',  'split.leader.b2',  'split.leader.b3'];
const LEARNER_BULLETS = ['split.learner.b1', 'split.learner.b2', 'split.learner.b3'];

interface Props {
  onOperator: () => void;
  onLearner: () => void;
}

export function TheSplit({ onOperator, onLearner }: Props) {
  const t = useT();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % PROFESSIONS.length), 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <section id="split" className="section-split">
      <div className="section-head">
        <Eyebrow k="split.eyebrow" />
        <h2 className="section-h split-h">
          <span>{t('split.h_static')}</span>{' '}
          <span className="split-rolling" aria-live="polite">
            {PROFESSIONS.map((p, i) => (
              <span
                key={p}
                className={`split-rolling-word${i === idx ? ' active' : ''}`}
              >
                {t(p)}
              </span>
            ))}
          </span>{' '}
          <span className="split-verdict">{t('split.h_verdict')}</span>
        </h2>
        <p className="section-lede">{t('split.lede')}</p>
      </div>

      {/* Real-world proof photo — Shibuya, Tokyo. The sign in the
          man's hands literally reads "Hired by AI — holding this
          sign". This is happening now, not a scare story. */}
      <figure className="split-proof">
        <a
          href="https://rentahuman.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="split-proof-frame"
          aria-label={t('split.proof.caption')}
        >
          <img
            src="/img/ai-hired-shibuya.jpg"
            alt={t('split.proof.alt')}
            loading="lazy"
            decoding="async"
          />
          <span className="split-proof-badge" aria-hidden="true">
            {t('split.proof.eyebrow')}
          </span>
        </a>
        <figcaption className="split-proof-caption">
          <b>«{t('split.proof.sign')}»</b>
          <br />
          {t('split.proof.caption')}
        </figcaption>
      </figure>

      {/* 8 profession strike-list */}
      <div className="split-list" aria-hidden="true">
        {PROFESSIONS.map((p, i) => (
          <span
            key={p}
            className={`split-list-item${i === idx ? ' hot' : ''}${i < idx ? ' done' : ''}`}
          >
            {t(p)}
          </span>
        ))}
      </div>

      {/* Two-track grid */}
      <div className="split-tracks-label">{t('split.tracks_label')}</div>
      <div className="split-tracks">
        <article className="split-track split-leader">
          <div className="split-track-tag">{t('split.leader.tag')}</div>
          <h3>{t('split.leader.h')}</h3>
          <p>{t('split.leader.p')}</p>
          <ul>
            {LEADER_BULLETS.map((k) => <li key={k}>{t(k)}</li>)}
          </ul>
          <button type="button" className="btn-primary" onClick={onOperator}>
            {t('split.leader.cta')}
            <span className="btn-caret">→</span>
          </button>
        </article>

        <article className="split-track split-learner">
          <div className="split-track-tag">{t('split.learner.tag')}</div>
          <h3>{t('split.learner.h')}</h3>
          <p>{t('split.learner.p')}</p>
          <ul>
            {LEARNER_BULLETS.map((k) => <li key={k}>{t(k)}</li>)}
          </ul>
          <button type="button" className="btn-ghost outline" onClick={onLearner}>
            {t('split.learner.cta')}
            <span className="btn-caret">→</span>
          </button>
        </article>
      </div>

      <div className="split-warning">
        <span className="split-warning-dot" />
        <RichText as="span" k="split.warning" />
      </div>
    </section>
  );
}
