import { useT } from '../../i18n/LangContext';
import './IncomeStreams.css';

/**
 * IncomeStreams — five tiles, one per Monar income stream. Each tile
 * shows today's earnings + a 7-day sparkline (tiny SVG from mock
 * numbers). Wire to /me/income/streams later.
 *
 * Source: ops/trendex-migration/monar-13-series-source.md § "5 потоков дохода".
 *   1. main      — +100% к лоту (основной)
 *   2. referrals — 5 уровней (постоянный доход с каждого круга реферала)
 *   3. worldPool — Мировой Пул, 8 бакетов, раздача в конце месяца, от $300
 *   4. network   — Нетворкинг (за выступления)
 *   5. ads       — Авто-реклама (9 мессенджеров, 46 языков)
 */

interface Stream {
  id: 'main' | 'referrals' | 'worldPool' | 'network' | 'ads';
  today: number;
  spark: number[]; // last 7 days
  accentVar: '--acid' | '--acid-2';
  /** Inline label fallback (used when i18n key is missing). */
  fallbackLabel: string;
}

const MOCK_STREAMS: Stream[] = [
  { id: 'main',      today: 18.00, spark: [6, 12, 10, 14, 16, 18, 18],          accentVar: '--acid',   fallbackLabel: 'Основной (+100% лота)' },
  { id: 'referrals', today: 12.40, spark: [2, 0, 3, 4, 2, 1, 12.4],             accentVar: '--acid-2', fallbackLabel: 'Рефералка (5 уровней)' },
  { id: 'worldPool', today:  0.00, spark: [0, 0, 0, 0, 0, 0, 0],                accentVar: '--acid',   fallbackLabel: 'Мировой Пул (раз/мес)' },
  { id: 'network',   today:  4.50, spark: [0, 0, 6, 0, 3, 0, 4.5],              accentVar: '--acid-2', fallbackLabel: 'Нетворкинг (выступления)' },
  { id: 'ads',       today:  1.20, spark: [0.8, 1.1, 0.9, 1.0, 1.4, 1.2, 1.2], accentVar: '--acid',   fallbackLabel: 'Авто-реклама (9 мессенджеров)' },
];

export function IncomeStreams() {
  const t = useT();
  const totalToday = MOCK_STREAMS.reduce((s, x) => s + x.today, 0);

  return (
    <section className="af-streams">
      <div className="af-streams-head">
        <div>
          <h2 className="af-acc-section-title">
            {t('dash.streams_title') || '5 потоков Monar'}
          </h2>
          <p className="af-streams-sub">
            {t('dash.streams_sub') ||
              'Каждый поток работает параллельно — все деньги стекаются на баланс дохода'}
          </p>
        </div>
        <div className="af-streams-total">
          <span className="af-streams-total-label">
            {t('dash.streams_total_today') || 'Сегодня всего'}
          </span>
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
  const label = t('dash.streams_' + stream.id) || stream.fallbackLabel;
  return (
    <div className="af-stream" style={{ ['--stream-accent' as string]: `var(${stream.accentVar})` }}>
      <div className="af-stream-label">{label}</div>
      <div className="af-stream-value">${stream.today.toFixed(2)}</div>
      <div className="af-stream-hint">{t('dash.streams_today') || 'сегодня'}</div>
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
