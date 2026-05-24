import { useT } from '../../i18n/LangContext';
import './IncomeStreams.css';

/**
 * IncomeStreams — four tiles, one per income stream. Each shows today's
 * income plus a 7-day sparkline (tiny SVG built from mock numbers).
 * Wire to /me/income/streams later.
 */

interface Stream {
  id: 'matrix' | 'referrals' | 'tasks' | 'ads';
  today: number;
  spark: number[]; // last 7 days
  accentVar: '--acid' | '--acid-2';
}

const MOCK_STREAMS: Stream[] = [
  { id: 'matrix',    today:  0.00, spark: [0, 0, 0, 0, 0, 0, 0],              accentVar: '--acid'   },
  { id: 'referrals', today: 12.40, spark: [2, 0, 3, 4, 2, 1, 12.4],           accentVar: '--acid-2' },
  { id: 'tasks',     today:  7.00, spark: [3, 5, 8, 4, 6, 9, 7],              accentVar: '--acid'   },
  { id: 'ads',       today:  1.20, spark: [0.8, 1.1, 0.9, 1.0, 1.4, 1.2, 1.2],accentVar: '--acid-2' },
];

export function IncomeStreams() {
  const t = useT();
  const totalToday = MOCK_STREAMS.reduce((s, x) => s + x.today, 0);

  return (
    <section className="af-streams">
      <div className="af-streams-head">
        <div>
          <h2 className="af-acc-section-title">{t('dash.streams_title')}</h2>
          <p className="af-streams-sub">{t('dash.streams_sub')}</p>
        </div>
        <div className="af-streams-total">
          <span className="af-streams-total-label">{t('dash.streams_total_today')}</span>
          <strong>${totalToday.toFixed(2)}</strong>
        </div>
      </div>

      <div className="af-streams-grid">
        {MOCK_STREAMS.map((s) => (
          <StreamTile key={s.id} stream={s} t={t} />
        ))}
      </div>
    </section>
  );
}

function StreamTile({ stream, t }: { stream: Stream; t: (k: string) => string }) {
  return (
    <div className="af-stream" style={{ ['--stream-accent' as string]: `var(${stream.accentVar})` }}>
      <div className="af-stream-label">{t('dash.streams_' + stream.id)}</div>
      <div className="af-stream-value">${stream.today.toFixed(2)}</div>
      <div className="af-stream-hint">{t('dash.streams_today')}</div>
      <Sparkline values={stream.spark} />
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return null;
  const W = 120;
  const H = 28;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = max - min || 1;

  const step = W / (values.length - 1 || 1);
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M ${pts.join(' L ')}`;
  const areaPath =
    `M 0,${H} L ${pts.join(' L ')} L ${W},${H} Z`;

  return (
    <svg className="af-stream-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <path d={areaPath} className="af-stream-spark-area" />
      <path d={linePath} className="af-stream-spark-line" />
    </svg>
  );
}
