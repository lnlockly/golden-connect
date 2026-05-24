export interface Booking {
  id: number;
  tariff_code: string;
  amount_usd: number;
  method: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | string;
  paid_at?: string | null;
  created_at: string;
}

interface Props {
  bookings: Booking[];
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  } catch { return iso; }
}

function statusMeta(status: string): { label: string; cls: string } {
  switch (status) {
    case 'paid': return { label: '✓', cls: 'tx-cab-bk-pill tx-cab-bk-pill--paid' };
    case 'pending': return { label: '⏳', cls: 'tx-cab-bk-pill tx-cab-bk-pill--pending' };
    case 'failed': return { label: '✕', cls: 'tx-cab-bk-pill tx-cab-bk-pill--failed' };
    default: return { label: '•', cls: 'tx-cab-bk-pill' };
  }
}

export function BookingsList({ bookings }: Props) {
  if (bookings.length === 0) {
    return <div style={{ color: '#9aa0a6', fontSize: 13 }}>Пока нет бронирований.</div>;
  }

  return (
    <div className="tx-cab-bk-list">
      {bookings.map((b) => {
        const s = statusMeta(b.status);
        return (
          <div key={b.id} className="tx-cab-bk-row">
            <span className={s.cls}>{s.label}</span>
            <div className="tx-cab-bk-info">
              <span className="tx-cab-bk-title">
                {b.tariff_code.toUpperCase()} · ${b.amount_usd}
              </span>
              <span className="tx-cab-bk-meta">
                {b.method} · {formatDate(b.paid_at ?? b.created_at)}
              </span>
            </div>
          </div>
        );
      })}
      <style>{`
        .tx-cab-bk-list { display: flex; flex-direction: column; gap: 6px; }
        .tx-cab-bk-row {
          display: grid; grid-template-columns: auto 1fr; gap: 10px;
          align-items: center; padding: 10px 12px;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 10px; background: rgba(255,255,255,0.02);
        }
        .tx-cab-bk-pill {
          width: 28px; height: 28px; border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 14px; font-weight: 700;
          background: rgba(255,255,255,0.05); color: #9aa0a6;
        }
        .tx-cab-bk-pill--paid { background: rgba(212,255,0,0.15); color: #d4ff00; }
        .tx-cab-bk-pill--pending { background: rgba(255,217,102,0.15); color: #ffd966; }
        .tx-cab-bk-pill--failed { background: rgba(209,67,67,0.15); color: #ff9a9a; }
        .tx-cab-bk-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .tx-cab-bk-title { font-size: 14px; font-weight: 600; color: #fff; }
        .tx-cab-bk-meta { font-size: 11px; color: #9aa0a6; text-transform: uppercase; letter-spacing: 0.04em; }
      `}</style>
    </div>
  );
}
