import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';

const CHANNELS = [
  { k: 'tg',  name: 'Telegram' },
  { k: 'tt',  name: 'TikTok' },
  { k: 'fb',  name: 'Facebook' },
  { k: 'x',   name: 'X' },
  { k: 'ig',  name: 'Instagram' },
  { k: 'yt',  name: 'YouTube' },
  { k: 'red', name: 'Reddit' },
  { k: 'ln',  name: 'LinkedIn' },
];

const CAPS = ['c1', 'c2', 'c3', 'c4'];

export function AgentGrowth() {
  const t = useT();
  return (
    <section id="growth" className="section-growth">
      <div className="section-head">
        <Eyebrow k="growth.eyebrow" />
        <RichText as="h2" className="section-h" k="growth.h" />
        <p className="section-lede">{t('growth.lede')}</p>
      </div>

      <div className="growth-grid">
        <div className="growth-left">
          <div className="growth-channels">
            <div className="growth-channels-label">{t('growth.channels_l')}</div>
            <div className="growth-channels-grid">
              {CHANNELS.map((c) => (
                <div key={c.k} className={`growth-chip ch-${c.k}`}>
                  <span className="growth-chip-dot" />
                  {c.name}
                </div>
              ))}
            </div>
          </div>

          <div className="growth-caps">
            {CAPS.map((c, i) => (
              <div key={c} className="growth-cap">
                <div className="growth-cap-num">{String(i + 1).padStart(2, '0')}</div>
                <h4>{t(`growth.${c}.h`)}</h4>
                <p>{t(`growth.${c}.p`)}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="growth-console" aria-hidden>
          <div className="growth-console-head">
            <span className="growth-console-live">
              <span className="dot" />
              {t('growth.console.live')}
            </span>
            <span className="growth-console-title">{t('growth.console.title')}</span>
          </div>

          <div className="growth-console-rows">
            {[
              { ch: 'TG', act: t('growth.console.r1'), cost: '$0.04', roi: '+412%' },
              { ch: 'TT', act: t('growth.console.r2'), cost: '$0.07', roi: '+287%' },
              { ch: 'FB', act: t('growth.console.r3'), cost: '$0.12', roi: '+186%' },
              { ch: 'X',  act: t('growth.console.r4'), cost: '$0.09', roi: '+244%' },
              { ch: 'IG', act: t('growth.console.r5'), cost: '$0.06', roi: '+362%' },
            ].map((r, i) => (
              <div key={i} className="growth-console-row">
                <span className={`growth-console-ch ch-${r.ch.toLowerCase()}`}>{r.ch}</span>
                <span className="growth-console-act">{r.act}</span>
                <span className="growth-console-cost">{r.cost}</span>
                <span className="growth-console-roi">{r.roi}</span>
              </div>
            ))}
          </div>

          <div className="growth-console-foot">
            <div className="growth-console-bar">
              <span className="bar-fill" />
            </div>
            <div className="growth-console-foot-l">{t('growth.console.foot')}</div>
          </div>
        </aside>
      </div>
    </section>
  );
}
