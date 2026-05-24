import { useEffect, useState } from 'react';
import { useT } from '../i18n/LangContext';

type Status = 'idle' | 'running' | 'delivered';

interface Agent {
  code: string;         // short ticker
  nameKey: string;
  catKey: string;
  tint: 'acid' | 'royal' | 'gold' | 'mint' | 'blood';
  jobs: number;
  rating: number;
  price: string;
}

const AGENTS: Agent[] = [
  { code: 'LND', nameKey: 'mp.a1.n',  catKey: 'mp.a1.c',  tint: 'acid',  jobs: 1284, rating: 4.9, price: '$100' },
  { code: 'BOT', nameKey: 'mp.a2.n',  catKey: 'mp.a2.c',  tint: 'royal', jobs: 892,  rating: 4.8, price: '$120' },
  { code: 'TKN', nameKey: 'mp.a3.n',  catKey: 'mp.a3.c',  tint: 'gold',  jobs: 308,  rating: 4.9, price: '$850' },
  { code: 'MAP', nameKey: 'mp.a4.n',  catKey: 'mp.a4.c',  tint: 'mint',  jobs: 642,  rating: 4.8, price: '$380' },
  { code: 'DSK', nameKey: 'mp.a5.n',  catKey: 'mp.a5.c',  tint: 'royal', jobs: 204,  rating: 4.7, price: '$720' },
  { code: 'SRV', nameKey: 'mp.a6.n',  catKey: 'mp.a6.c',  tint: 'acid',  jobs: 1104, rating: 4.8, price: '$260' },
  { code: 'PRS', nameKey: 'mp.a7.n',  catKey: 'mp.a7.c',  tint: 'mint',  jobs: 2418, rating: 4.7, price: '$140' },
  { code: 'ADS', nameKey: 'mp.a8.n',  catKey: 'mp.a8.c',  tint: 'blood', jobs: 3610, rating: 4.6, price: '$100' },
  { code: 'TTK', nameKey: 'mp.a9.n',  catKey: 'mp.a9.c',  tint: 'blood', jobs: 1862, rating: 4.8, price: '$180' },
  { code: 'YTB', nameKey: 'mp.a10.n', catKey: 'mp.a10.c', tint: 'gold',  jobs: 920,  rating: 4.8, price: '$220' },
  { code: 'DSG', nameKey: 'mp.a11.n', catKey: 'mp.a11.c', tint: 'acid',  jobs: 2108, rating: 4.7, price: '$120' },
  { code: 'CNT', nameKey: 'mp.a12.n', catKey: 'mp.a12.c', tint: 'mint',  jobs: 1422, rating: 4.8, price: '$100' },
];

const CYCLE = ['idle', 'running', 'delivered'] as const;

// Per-card offset in the cycle — a co-prime stride with CYCLE.length
// (3) so consecutive cards always land on different statuses rather
// than rippling in groups of 4.
const STRIDES = [0, 2, 1, 0, 1, 2, 2, 0, 1, 1, 2, 0];

const TABS = ['tab1', 'tab2', 'tab3'] as const;

interface Props {
  onHire?: () => void;
}

export function MarketplaceDemo({ onHire }: Props = {}) {
  const t = useT();
  const [phase, setPhase] = useState(0);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % CYCLE.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mp-demo" aria-label="live marketplace preview">
      <div className="mp-demo-top">
        <div className="mp-demo-tabs" role="tablist">
          {TABS.map((k, i) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={activeTab === i}
              className={activeTab === i ? 'active' : undefined}
              onClick={() => setActiveTab(i)}
            >
              {t(`mp.${k}`)}
            </button>
          ))}
        </div>
        <div className="mp-demo-search">
          <span className="mp-search-icon">⌕</span>
          <span className="mp-search-text">{t('mp.search')}</span>
          <span className="mp-search-caret">|</span>
        </div>
      </div>

      <div className="mp-grid">
        {AGENTS.map((a, i) => {
          // Each card is offset by its own stride so the grid never
          // shows banded groups flipping together.
          const offset = (phase + STRIDES[i % STRIDES.length]) % CYCLE.length;
          const status: Status = CYCLE[offset];
          return (
            <article
              key={a.code}
              className={`mp-card tint-${a.tint} status-${status}`}
              onClick={onHire}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHire?.(); }
              }}
              role="button"
              tabIndex={0}
            >
              <header className="mp-card-head">
                <span className="mp-card-avatar">{a.code}</span>
                <span className={`mp-card-status s-${status}`}>
                  <span className="dot" />
                  {t(`mp.status.${status}`)}
                </span>
              </header>
              <h4 className="mp-card-name">{t(a.nameKey)}</h4>
              <div className="mp-card-cat">{t(a.catKey)}</div>

              <div className="mp-card-progress" aria-hidden>
                <div className="mp-card-progress-fill" />
              </div>

              <footer className="mp-card-foot">
                <div className="mp-card-stats">
                  <span>{a.jobs.toLocaleString('en-US')} {t('mp.jobs')}</span>
                  <span>★ {a.rating.toFixed(1)}</span>
                </div>
                <div className="mp-card-actions">
                  <span className="mp-card-price">{t('mp.from')} {a.price}</span>
                  <button
                    className="mp-card-hire"
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onHire?.(); }}
                  >
                    {t('mp.hire')}
                  </button>
                </div>
              </footer>
            </article>
          );
        })}
      </div>

      <div className="mp-demo-foot">
        <span className="mp-demo-live">
          <span className="mp-demo-live-dot" />
          {t('mp.live')}
        </span>
        <span className="mp-demo-count">{t('mp.count')}</span>
      </div>
    </div>
  );
}
