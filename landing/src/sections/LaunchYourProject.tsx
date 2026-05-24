import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';

const WHATS = ['what1', 'what2', 'what3'];
const STEPS = ['step1', 'step2', 'step3', 'step4'];

export function LaunchYourProject({ onOrder }: { onOrder: () => void }) {
  const t = useT();
  return (
    <section id="launch" className="section-launch launch-v2-section">
      <div className="section-head launch-v2-head">
        <Eyebrow k="launch.eyebrow_v2" />
        <RichText as="h2" className="section-h launch-v2-h" k="launch.h_v2" />
        <p className="section-lede launch-v2-lede">{t('launch.lede_v2')}</p>
      </div>

      <div className="launch-v2-whats">
        {WHATS.map((w, i) => (
          <div key={w} className={`launch-v2-what w-${i + 1}`}>
            <div className="launch-v2-what-n">{String(i + 1).padStart(2, '0')}</div>
            <h3 className="launch-v2-what-h">{t(`launch.${w}_h`)}</h3>
            <p className="launch-v2-what-p">{t(`launch.${w}_p`)}</p>
          </div>
        ))}
      </div>

      <div className="launch-mock-wrap">
        <aside className="launch-mock" aria-hidden>
          <div className="launch-mock-chrome">
            <span /><span /><span />
            <span className="launch-mock-title">launch.golden-connect · new project</span>
          </div>

          <div className="launch-mock-body">
            <div className="launch-mock-col">
              <div className="launch-mock-field">
                <div className="launch-mock-label">{t('launch.mock.name_l')}</div>
                <div className="launch-mock-input">
                  <span className="launch-mock-text">Café-Bot by Anna</span>
                  <span className="launch-mock-caret">|</span>
                </div>
              </div>

              <div className="launch-mock-row">
                <div className="launch-mock-field">
                  <div className="launch-mock-label">{t('launch.mock.symbol_l')}</div>
                  <div className="launch-mock-input"><span className="launch-mock-text">$CAFEE</span></div>
                </div>
                <div className="launch-mock-field">
                  <div className="launch-mock-label">{t('launch.mock.supply_l')}</div>
                  <div className="launch-mock-input"><span className="launch-mock-text">1,000,000,000</span></div>
                </div>
              </div>

              <div className="launch-mock-field">
                <div className="launch-mock-label">{t('launch.mock.agents_l')}</div>
                <div className="launch-mock-chips">
                  <span className="launch-mock-chip">Landing</span>
                  <span className="launch-mock-chip">Telegram bot</span>
                  <span className="launch-mock-chip active">Ad mailings</span>
                  <span className="launch-mock-chip">Parser</span>
                  <span className="launch-mock-chip">+ 3</span>
                </div>
              </div>
            </div>

            <div className="launch-mock-col">
              <div className="launch-mock-progress">
                <div className="launch-mock-progress-title">{t('launch.mock.progress_title')}</div>
                <div className="launch-mock-progress-row"><span>{t('launch.mock.step1')}</span><span className="done">✓</span></div>
                <div className="launch-mock-progress-row"><span>{t('launch.mock.step2')}</span><span className="done">✓</span></div>
                <div className="launch-mock-progress-row"><span>{t('launch.mock.step3')}</span><span className="running">●</span></div>
                <div className="launch-mock-progress-row pending"><span>{t('launch.mock.step4')}</span><span>—</span></div>
              </div>
            </div>
          </div>

          <footer className="launch-mock-foot">
            <span>{t('launch.mock.foot_l')}</span>
            <span className="launch-mock-foot-v">{t('launch.mock.foot_v')}</span>
          </footer>
        </aside>
      </div>

      <div className="launch-v2-steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`launch-v2-step s${i + 1}`}>
            <div className="launch-v2-step-num">{String(i + 1).padStart(2, '0')}</div>
            <h4 className="launch-v2-step-h">{t(`launch.${s}_h`)}</h4>
            <p className="launch-v2-step-p">{t(`launch.${s}_p`)}</p>
          </div>
        ))}
      </div>

      <div className="launch-v2-cta">
        {/* /app dashboard link hidden until launch.
        <Link to="/app" className="btn-primary launch-v2-cta-primary">
          {t('launch.cta_dashboard')}
          <span className="btn-caret">→</span>
        </Link>
        */}
        <button className="btn-primary launch-v2-cta-primary" onClick={onOrder} type="button">
          {t('launch.cta_create_agent')}
          <span className="btn-caret">→</span>
        </button>
      </div>
    </section>
  );
}
