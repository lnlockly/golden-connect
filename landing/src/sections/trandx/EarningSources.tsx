import { useT } from '../../i18n/LangContext';

const STATS = [
  { k: 'work',  v: '24/7' },
  { k: 'svc',   v: '6+'   },
  { k: 'fees',  v: '0'    },
  { k: 'scale', v: '∞'    },
];

export function EarningSources() {
  const t = useT();
  return (
    <section id="earnings" className="section-earnings stats-band">
      <div className="mx-earn-grid stats-grid">
        {STATS.map((s) => (
          <article key={s.k} className="mx-earn-card">
            <div className="mx-earn-num big-stat-num">{s.v}</div>
            <div className="mx-earn-meta big-stat-label">{t(`tx.stats.${s.k}`)}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
