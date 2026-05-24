import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';

interface Op {
  rank: number;
  handle: string;
  code: string;
  spec: string;
  jobs: number;
  rating: number;
  earnKey: string;
  badge?: 'top' | 'rising';
}

const LEADERBOARD: Op[] = [
  { rank: 1, handle: '@sergey.os',   code: 'SG', spec: 'mp.a6.n', jobs: 412, rating: 4.98, earnKey: 'op.earn.l1', badge: 'top' },
  { rank: 2, handle: '@mia.builds',  code: 'MB', spec: 'mp.a4.n', jobs: 388, rating: 4.95, earnKey: 'op.earn.l2' },
  { rank: 3, handle: '@0xrei',       code: 'RE', spec: 'mp.a3.n', jobs: 302, rating: 4.94, earnKey: 'op.earn.l3' },
  { rank: 4, handle: '@kai.parse',   code: 'KP', spec: 'mp.a7.n', jobs: 648, rating: 4.92, earnKey: 'op.earn.l4', badge: 'rising' },
  { rank: 5, handle: '@nova.ads',    code: 'NV', spec: 'mp.a8.n', jobs: 1284, rating: 4.89, earnKey: 'op.earn.l5' },
  { rank: 6, handle: '@yumi.yt',     code: 'YU', spec: 'mp.a10.n', jobs: 420, rating: 4.88, earnKey: 'op.earn.l6' },
  { rank: 7, handle: '@dex.runtime', code: 'DX', spec: 'mp.a5.n', jobs: 184, rating: 4.87, earnKey: 'op.earn.l7' },
  { rank: 8, handle: '@lu.tiktok',   code: 'LU', spec: 'mp.a9.n', jobs: 1602, rating: 4.85, earnKey: 'op.earn.l8', badge: 'rising' },
];

const PILLARS = ['p1', 'p2', 'p3'];

interface Props {
  onOrder?: () => void;
}

export function OperatorSupply({ onOrder }: Props = {}) {
  const t = useT();
  return (
    <section id="operators" className="section-op">
      <div className="section-head">
        <Eyebrow k="op.eyebrow" />
        <RichText as="h2" className="section-h" k="op.h" />
        <p className="section-lede">{t('op.lede')}</p>
      </div>

      <div className="op-grid">
        <div className="op-leaderboard">
          <header className="op-lb-head">
            <span className="op-lb-title">
              <span className="dot" />
              {t('op.lb.title')}
            </span>
            <span className="op-lb-meta">{t('op.lb.meta')}</span>
          </header>

          <div className="op-lb-cols">
            <span>#</span>
            <span>{t('op.lb.col_op')}</span>
            <span>{t('op.lb.col_spec')}</span>
            <span>{t('op.lb.col_jobs')}</span>
            <span>{t('op.lb.col_rating')}</span>
            <span>{t('op.lb.col_earn')}</span>
          </div>

          <div className="op-lb-rows">
            {LEADERBOARD.map((o) => (
              <div key={o.rank} className={`op-lb-row${o.badge ? ' b-' + o.badge : ''}`}>
                <span className="op-lb-rank">{String(o.rank).padStart(2, '0')}</span>
                <span className="op-lb-op">
                  <span className="op-lb-avatar">{o.code}</span>
                  <span className="op-lb-handle">
                    {o.handle}
                    {o.badge === 'top' && <span className="op-lb-badge top">{t('op.lb.top')}</span>}
                    {o.badge === 'rising' && <span className="op-lb-badge rising">{t('op.lb.rising')}</span>}
                  </span>
                </span>
                <span className="op-lb-spec">{t(o.spec)}</span>
                <span className="op-lb-jobs">{o.jobs.toLocaleString('en-US')}</span>
                <span className="op-lb-rating">★ {o.rating.toFixed(2)}</span>
                <span className="op-lb-earn">{t(o.earnKey)}</span>
              </div>
            ))}
          </div>

          <footer className="op-lb-foot">
            <span>{t('op.lb.foot_l')}</span>
            <span className="op-lb-foot-v">{t('op.lb.foot_v')}</span>
          </footer>
        </div>

        <div className="op-pillars">
          <div className="op-pillars-title">{t('op.pillars_title')}</div>
          {PILLARS.map((p, i) => (
            <div key={p} className={`op-pillar p${i + 1}`}>
              <div className="op-pillar-num">{String(i + 1).padStart(2, '0')}</div>
              <h4>{t(`op.pillar.${p}.h`)}</h4>
              <p>{t(`op.pillar.${p}.p`)}</p>
            </div>
          ))}

          <div className="op-apply">
            <div className="op-apply-label">{t('op.apply.label')}</div>
            <p>{t('op.apply.p')}</p>
            <button
              type="button"
              className="btn-ghost outline"
              onClick={() => onOrder?.()}
            >
              {t('op.apply.cta')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
