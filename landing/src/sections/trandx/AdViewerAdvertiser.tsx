import { useState } from 'react';
import { useT } from '../../i18n/LangContext';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { RichText } from '../../components/ui/RichText';

type TabKey = 'business' | 'users' | 'partners';

const TABS: { k: TabKey }[] = [
  { k: 'business' },
  { k: 'users' },
  { k: 'partners' },
];

const BENEFIT_KEYS = ['b1', 'b2', 'b3', 'b4'];

export function AdViewerAdvertiser() {
  const t = useT();
  const [tab, setTab] = useState<TabKey>('business');

  return (
    <section id="for-who" className="section-ads section-for-who">
      <div className="section-head">
        <Eyebrow k="tx.forwho.eyebrow" />
        <RichText as="h2" className="section-h" k="tx.forwho.h" />
        <p className="section-lede">{t('tx.forwho.lede')}</p>
      </div>

      <div className="mx-ads-tabs tab-switch" role="tablist">
        {TABS.map((tb) => (
          <button
            key={tb.k}
            type="button"
            role="tab"
            className={`tab-btn${tab === tb.k ? ' active' : ''}`}
            aria-selected={tab === tb.k}
            onClick={() => setTab(tb.k)}
          >
            {t(`tx.forwho.tab_${tb.k}`)}
          </button>
        ))}
      </div>

      <div className="mx-ads-split mx-forwho-grid benefit-grid" role="tabpanel">
        {BENEFIT_KEYS.map((bk) => (
          <article key={bk} className="mx-ads-card benefit-card">
            <h3>{t(`tx.forwho.${tab}.${bk}.h`)}</h3>
            <p>{t(`tx.forwho.${tab}.${bk}.p`)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
