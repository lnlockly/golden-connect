import { useEffect, useState } from 'react';
import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';

const MILESTONES: { x: number; y: number; date: string; k: string }[] = [
  { x:  80, y: 360, date: '2020',  k: 'accel.m1' },
  { x: 200, y: 320, date: '11/22', k: 'accel.m2' },
  { x: 320, y: 268, date: '03/23', k: 'accel.m3' },
  { x: 450, y: 210, date: '06/24', k: 'accel.m4' },
  { x: 560, y: 164, date: '09/24', k: 'accel.m5' },
  { x: 680, y: 120, date: '03/25', k: 'accel.m6' },
  { x: 790, y:  82, date: '10/25', k: 'accel.m7' },
  { x: 920, y:  46, date: '2026+', k: 'accel.m8' },
];

function buildPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    d += ` Q ${p1.x} ${p1.y}, ${mx} ${my}`;
  }
  const last = pts[pts.length - 1];
  d += ` T ${last.x} ${last.y}`;
  return d;
}

const COUNTERS: { v: string; l: string }[] = [
  { v: 'accel.c1_v', l: 'accel.c1_l' },
  { v: 'accel.c2_v', l: 'accel.c2_l' },
  { v: 'accel.c3_v', l: 'accel.c3_l' },
  { v: 'accel.c4_v', l: 'accel.c4_l' },
];

const TICKER_ITEMS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10'];

export function IndustryManifesto() {
  const t = useT();
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setHighlight((h) => (h + 1) % MILESTONES.length), 2400);
    return () => clearInterval(id);
  }, []);

  const path = buildPath(MILESTONES);

  return (
    <section id="manifesto" className="section-accel">
      <div className="section-head">
        <Eyebrow k="accel.eyebrow" />
        <RichText as="h2" className="section-h" k="accel.h" />
        <p className="section-lede">{t('accel.lede')}</p>
      </div>

      <div className="accel-stage">
        <div className="accel-chart-label">
          <span className="accel-chart-dot" />
          {t('accel.chart_label')}
        </div>

        <svg
          className="accel-svg"
          viewBox="0 0 1000 420"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <g className="accel-grid">
            {[80, 160, 240, 320].map((y) => (
              <line key={y} x1="0" x2="1000" y1={y} y2={y} />
            ))}
            {[200, 400, 600, 800].map((x) => (
              <line key={x} x1={x} x2={x} y1="0" y2="400" />
            ))}
          </g>

          <rect className="accel-now-band" x="750" y="0" width="80" height="400" />
          <line className="accel-now-line" x1="790" x2="790" y1="0" y2="400" />
          <text className="accel-now-text" x="790" y="18" textAnchor="middle">
            {t('accel.now_label')}
          </text>

          <path className="accel-area" d={`${path} L 920 400 L 80 400 Z`} />
          <path className="accel-curve" d={path} />

          {MILESTONES.map((m, i) => (
            <g key={i} className={`accel-ms ms-${i} ${highlight === i ? 'hot' : ''}`}>
              <circle className="accel-ms-halo" cx={m.x} cy={m.y} r="14" />
              <circle className="accel-ms-dot"  cx={m.x} cy={m.y} r="5" />
              <text className="accel-ms-date" x={m.x} y={m.y - 20} textAnchor="middle">
                {m.date}
              </text>
            </g>
          ))}

          <text className="accel-future" x="960" y="36" textAnchor="end">
            {t('accel.future_label')}
          </text>
        </svg>

        <ol className="accel-ms-legend">
          {MILESTONES.map((m, i) => (
            <li key={i} className={highlight === i ? 'hot' : undefined}>
              <span className="accel-ms-legend-date">{m.date}</span>
              <span className="accel-ms-legend-text">{t(m.k)}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="accel-counters">
        {COUNTERS.map((c, i) => (
          <div key={i} className="accel-counter">
            <div className="accel-counter-v">{t(c.v)}</div>
            <div className="accel-counter-l">{t(c.l)}</div>
          </div>
        ))}
      </div>

      <div className="accel-ticker-wrap" aria-hidden="true">
        <div className="accel-ticker-label">
          <span className="accel-ticker-dot" />
          {t('accel.ticker_label')}
        </div>
        <div className="accel-ticker">
          <div className="accel-ticker-track">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((k, i) => (
              <span key={i} className="accel-ticker-item">
                <span className="accel-ticker-bullet" />
                {t(`accel.${k}`)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="accel-kicker">{t('accel.kicker')}</p>
    </section>
  );
}
