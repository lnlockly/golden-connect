import { useEffect, useState } from 'react';
import { useT } from '../i18n/LangContext';

const STATS: { k: string; base: number; jitter: number; prefix?: string; suffix?: string; fmt?: 'int' | 'compact' }[] = [
  { k: 'ticker.jobs', base: 12840, jitter: 8, fmt: 'int' },
  { k: 'ticker.agents', base: 342, jitter: 1, fmt: 'int' },
  { k: 'ticker.operators', base: 1280, jitter: 2, fmt: 'int' },
  { k: 'ticker.gmv', base: 1842000, jitter: 1200, prefix: '$', fmt: 'compact' },
  { k: 'ticker.success', base: 97.4, jitter: 0, suffix: '%' },
];

function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(Math.round(n));
}

function format(v: number, fmt?: 'int' | 'compact'): string {
  if (fmt === 'compact') return compact(v);
  if (fmt === 'int') return Math.round(v).toLocaleString('en-US');
  return v.toFixed(1);
}

export function LiveTicker() {
  const t = useT();
  const [values, setValues] = useState<number[]>(STATS.map((s) => s.base));

  useEffect(() => {
    const id = setInterval(() => {
      setValues((prev) =>
        prev.map((v, i) => {
          const s = STATS[i];
          if (s.jitter === 0) return v;
          return v + Math.random() * s.jitter;
        })
      );
    }, 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="live-ticker" role="status" aria-live="polite">
      <span className="live-ticker-dot" aria-hidden />
      {STATS.map((s, i) => (
        <div key={s.k} className="live-ticker-item">
          <span className="v">
            {s.prefix ?? ''}
            {format(values[i], s.fmt)}
            {s.suffix ?? ''}
          </span>
          <span className="l">{t(s.k)}</span>
        </div>
      ))}
    </div>
  );
}
