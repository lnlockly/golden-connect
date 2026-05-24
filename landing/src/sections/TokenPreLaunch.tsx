import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';
import { WaitlistButton } from '../components/WaitlistButton';

const USES = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];

const DIST = [
  { k: 'd1', pct: 35 },
  { k: 'd2', pct: 20 },
  { k: 'd3', pct: 18 },
  { k: 'd4', pct: 12 },
  { k: 'd5', pct: 10 },
  { k: 'd6', pct: 5 },
];

export function TokenPreLaunch() {
  const t = useT();
  return (
    <section id="token" className="section-token">
      <div className="section-head">
        <Eyebrow k="token.eyebrow" />
        <RichText as="h2" className="section-h" k="token.h" />
        <p className="section-lede">{t('token.lede')}</p>
      </div>

      <div className="token-hero-v2">
        <div className="token-hero-left">
          <div className="token-ticker">FLOW</div>
          <div className="token-meta">{t('token.meta')}</div>

          <div className="token-status">
            <span className="token-status-dot" />
            <span className="token-status-label">{t('token.status_l')}</span>
            <span className="token-status-value">{t('token.status_v')}</span>
          </div>

          <RichText as="p" className="token-disclaim-v2" k="token.disclaim" />

          <div className="token-cta-row">
            <WaitlistButton variant="primary" labelKey="token.cta" />
            <a className="btn-ghost" href="/whitepaper">
              {t('token.read')}
            </a>
          </div>
        </div>

        <div className="token-hero-right">
          <div className="token-dist">
            <div className="token-dist-title">{t('token.dist_title')}</div>
            {DIST.map((d) => (
              <div key={d.k} className="token-dist-row">
                <div className="token-dist-nm">{t(`token.${d.k}`)}</div>
                <div className="token-dist-bar">
                  <span className="fill" style={{ width: `${d.pct}%` }} />
                </div>
                <div className="token-dist-pct">{d.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="token-uses">
        <div className="token-uses-title">{t('token.uses_title')}</div>
        <div className="token-uses-grid">
          {USES.map((u, i) => (
            <div key={u} className="token-use">
              <div className="token-use-n">{String(i + 1).padStart(2, '0')}</div>
              <h4>{t(`token.${u}.h`)}</h4>
              <p>{t(`token.${u}.p`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
