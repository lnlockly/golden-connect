import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

// API returns `entry_micro` as a stringified bigint ($ * 1_000_000). We also
// tolerate `amount_usd` if a future server build starts emitting it.
export interface Tariff {
  code: string;
  name: string;
  entry_micro?: string | number;
  amount_usd?: number;
  description?: string | null;
}

interface TariffsResponse {
  ok?: boolean;
  tariffs?: Tariff[];
}

interface Props {
  selected: string | null;
  onSelect: (code: string) => void;
  disabled?: boolean;
}

function priceUsd(t: Tariff): number {
  if (typeof t.amount_usd === 'number') return t.amount_usd;
  if (t.entry_micro !== undefined) {
    const n = typeof t.entry_micro === 'string' ? Number(t.entry_micro) : t.entry_micro;
    if (Number.isFinite(n)) return n / 1_000_000;
  }
  return 0;
}

function formatPrice(usd: number): string {
  if (usd === 0) return 'Free';
  return `$${usd.toLocaleString('en-US')}`;
}

export function TariffPicker({ selected, onSelect, disabled }: Props) {
  const [tariffs, setTariffs] = useState<Tariff[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiGet<TariffsResponse | Tariff[]>('/tariffs');
        const all: Tariff[] = Array.isArray(res) ? res : (res?.tariffs ?? []);
        // Hide Free ($0) — booking is pre-launch *paid* entry reservation.
        const list = all.filter((t) => priceUsd(t) > 0);
        if (!active) return;
        setTariffs(list);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
        setTariffs([]);
      }
    })();
    return () => { active = false; };
  }, []);

  if (tariffs === null) {
    return <div style={{ color: '#9aa0a6', fontSize: 13 }}>Загрузка тарифов…</div>;
  }

  if (tariffs.length === 0) {
    return (
      <div style={{ color: '#9aa0a6', fontSize: 13 }}>
        {error ? `Не удалось загрузить тарифы: ${error}` : 'Пока нет доступных тарифов.'}
      </div>
    );
  }

  return (
    <div className="tx-cab-tariffs-grid">
      {tariffs.map((t) => {
        const active = selected === t.code;
        const usd = priceUsd(t);
        return (
          <button
            key={t.code}
            type="button"
            onClick={() => onSelect(t.code)}
            disabled={disabled}
            className={'tx-cab-tariff-card' + (active ? ' is-active' : '')}
          >
            <span className="tx-cab-tariff-code">{t.code.toUpperCase()}</span>
            <span className="tx-cab-tariff-name">{t.name}</span>
            <span className="tx-cab-tariff-price">{formatPrice(usd)}</span>
          </button>
        );
      })}
    </div>
  );
}
