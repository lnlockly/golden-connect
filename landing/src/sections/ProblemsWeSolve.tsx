import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';

interface Curve {
  key: 'capability' | 'cost' | 'autonomy' | 'integration';
  /** SVG path. All curves converge at (720, 220) within a 1000x440 viewBox. */
  d: string;
  /** anchor point on the left side for the legend label */
  label: { x: number; y: number };
  color: string;
  direction: 'up' | 'down';
}

const CONVERGENCE = { x: 720, y: 220 };

const CURVES: Curve[] = [
  // Capability (up, acid) — starts low-left, arcs up to convergence
  {
    key: 'capability',
    color: 'var(--acid)',
    direction: 'up',
    d: 'M 60 380 C 260 360, 460 300, 720 220',
    label: { x: 50, y: 384 },
  },
  // Cost (down, gold) — starts high-left, arcs down
  {
    key: 'cost',
    color: 'var(--gold)',
    direction: 'down',
    d: 'M 60 60 C 260 80, 460 140, 720 220',
    label: { x: 50, y: 58 },
  },
  // Autonomy (up, royal) — starts low-left, steeper arc
  {
    key: 'autonomy',
    color: 'var(--royal)',
    direction: 'up',
    d: 'M 60 420 C 200 420, 500 380, 720 220',
    label: { x: 50, y: 420 },
  },
  // Integration (down, mint) — starts high-left, gradual arc
  {
    key: 'integration',
    color: 'var(--acid-2)',
    direction: 'down',
    d: 'M 60 20 C 260 30, 500 100, 720 220',
    label: { x: 50, y: 22 },
  },
];

const HITS = ['hit1', 'hit2', 'hit3', 'hit4'];

export function ProblemsWeSolve() {
  const t = useT();

  return (
    <section id="problems" className="section-sing">
      <div className="section-head">
        <Eyebrow k="sing.eyebrow" />
        <RichText as="h2" className="section-h" k="sing.h" />
        <p className="section-lede">{t('sing.lede')}</p>
      </div>

      <div className="sing-stage">
        <svg
          className="sing-svg"
          viewBox="0 0 1000 440"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          {/* grid */}
          <g className="sing-grid">
            {[110, 220, 330].map((y) => (
              <line key={y} x1="0" x2="1000" y1={y} y2={y} />
            ))}
          </g>

          {/* Before / After bands */}
          <text className="sing-band-before" x="60" y="430">
            ← {t('sing.before_label')}
          </text>
          <text className="sing-band-after" x="960" y="430" textAnchor="end">
            {t('sing.after_label')} →
          </text>

          {/* NOW vertical line */}
          <line className="sing-now-line" x1={CONVERGENCE.x} y1="0" x2={CONVERGENCE.x} y2="440" />
          <rect className="sing-now-band" x={CONVERGENCE.x - 30} y="0" width="60" height="440" />
          <text className="sing-now-text" x={CONVERGENCE.x} y="20" textAnchor="middle">
            {t('sing.now_label')}
          </text>

          {/* Convergence glow */}
          <circle className="sing-conv-glow" cx={CONVERGENCE.x} cy={CONVERGENCE.y} r="34" />
          <circle className="sing-conv-core" cx={CONVERGENCE.x} cy={CONVERGENCE.y} r="8" />

          {/* Four curves */}
          {CURVES.map((c, i) => (
            <g key={c.key} className={`sing-curve sing-c-${c.key}`} style={{ ['--d' as any]: `${i * 140}ms` }}>
              <path d={c.d} stroke={c.color} fill="none" />
              <circle cx={c.label.x} cy={c.label.y} r="4" fill={c.color} />
              <text x={c.label.x + 12} y={c.label.y + 4} fill={c.color}>
                {t(`sing.curve_${c.key}`)}
              </text>
            </g>
          ))}

          {/* Arrow from convergence to the right */}
          <path
            className="sing-arrow"
            d={`M ${CONVERGENCE.x + 30} ${CONVERGENCE.y} L 960 ${CONVERGENCE.y}`}
          />
          <polygon
            className="sing-arrow-head"
            points={`955,${CONVERGENCE.y - 6} 965,${CONVERGENCE.y} 955,${CONVERGENCE.y + 6}`}
          />
        </svg>

        <div className="sing-curves-legend">
          {CURVES.map((c) => (
            <div key={c.key} className={`sing-leg sing-leg-${c.key}`}>
              <div className="sing-leg-head">
                <span className="sing-leg-dot" style={{ background: c.color }} />
                <span className="sing-leg-title">{t(`sing.curve_${c.key}`)}</span>
                <span className={`sing-leg-arrow sing-leg-arrow-${c.direction}`}>
                  {c.direction === 'up' ? '↑' : '↓'}
                </span>
              </div>
              <p>{t(`sing.curve_${c.key}_p`)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="sing-hits">
        <div className="sing-hits-label">{t('sing.hits_label')}</div>
        <ul>
          {HITS.map((h) => (
            <li key={h}>{t(`sing.${h}`)}</li>
          ))}
        </ul>
      </div>

      <div className="sing-close">
        <div className="sing-close-label">{t('sing.close_label')}</div>
        <RichText as="h3" className="sing-close-h" k="sing.close_h" />
        <p className="sing-close-p">{t('sing.close_p')}</p>
      </div>
    </section>
  );
}
