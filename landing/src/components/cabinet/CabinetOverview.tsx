import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { apiGet, apiPost } from '../../lib/api';
import { TariffPicker } from './TariffPicker';
import { BookingsList, type Booking } from './BookingsList';

type Method = 'cryptobot';

interface BookingsResponse {
  ok: boolean;
  bookings: Booking[];
}

interface BookResponse {
  ok: boolean;
  booking_id?: number;
  pay_url?: string;
}

/**
 * Overview — the default /cabinet view. Shows booking hero, tariff picker
 * and history. Onboarding moved to /cabinet/panel.
 */
export function CabinetOverview() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuthenticated } = useAuth();

  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [selectedTariff, setSelectedTariff] = useState<string | null>(null);
  const method: Method = 'cryptobot';
  const [bookSubmitting, setBookSubmitting] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    try {
      const res = await apiGet<BookingsResponse>('/me/bookings');
      setBookings(res?.bookings ?? []);
      setBookingsError(null);
    } catch (e) {
      setBookingsError(e instanceof Error ? e.message : String(e));
      setBookings([]);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadBookings();
  }, [isAuthenticated, loadBookings]);

  const pendingReturn = params.get('pending') === '1';

  const heroBooking = useMemo<Booking | null>(() => {
    if (!bookings || bookings.length === 0) return null;
    const paid = bookings.find((b) => b.status === 'paid');
    if (paid) return paid;
    const pending = bookings.find((b) => b.status === 'pending');
    return pending ?? null;
  }, [bookings]);

  const onBook = async () => {
    if (!selectedTariff || bookSubmitting) return;
    setBookSubmitting(true);
    setBookError(null);
    try {
      const res = await apiPost<BookResponse>('/me/book', {
        tariff_code: selectedTariff,
        method,
      });
      if (res.pay_url) {
        window.open(res.pay_url, '_blank', 'noopener,noreferrer');
        navigate('/cabinet?pending=1', { replace: true });
        await loadBookings();
      } else {
        setBookError('API не вернуло ссылку для оплаты.');
      }
    } catch (e) {
      setBookError(e instanceof Error ? e.message : String(e));
    } finally {
      setBookSubmitting(false);
    }
  };

  return (
    <>
      {pendingReturn ? (
        <div className="tx-cab-banner">
          Оплата открыта в новой вкладке. Статус обновится автоматически —
          обнови страницу через минуту.
        </div>
      ) : null}

      <section className="tx-cab-section">
        {heroBooking && heroBooking.status === 'paid' ? (
          <div className="tx-cab-hero tx-cab-hero--paid">
            <div className="tx-cab-hero-badge">✓ Место забронировано</div>
            <div className="tx-cab-hero-title">
              {heroBooking.tariff_code.toUpperCase()}
              <span className="tx-cab-hero-price">
                ·&nbsp;${heroBooking.amount_usd}
              </span>
            </div>
            <div className="tx-cab-hero-sub">
              Оплачено {formatDate(heroBooking.paid_at)}
            </div>
          </div>
        ) : heroBooking && heroBooking.status === 'pending' ? (
          <div className="tx-cab-hero tx-cab-hero--pending">
            <div className="tx-cab-hero-badge">⏳ Оплата проверяется</div>
            <div className="tx-cab-hero-title">
              {heroBooking.tariff_code.toUpperCase()}
              <span className="tx-cab-hero-price">
                ·&nbsp;${heroBooking.amount_usd}
              </span>
            </div>
            <div className="tx-cab-hero-sub">
              Подтвердим, как только придёт webhook от провайдера.
            </div>
          </div>
        ) : (
          <div className="tx-cab-hero tx-cab-hero--empty">
            <div className="tx-cab-hero-title">
              Активируй первое бизнес-место
            </div>
            <div className="tx-cab-hero-sub">
              Ранний доступ = ×2 рекламный бюджет и закреплённая позиция в сети.
            </div>
          </div>
        )}
      </section>

      <TariffPicker
        selected={selectedTariff}
        onSelect={setSelectedTariff}
        disabled={bookSubmitting}
      />

      {selectedTariff ? (
        <section className="tx-cab-section tx-cab-pay">
          {bookError ? <div className="tx-cab-error">{bookError}</div> : null}
          <button
            type="button"
            onClick={onBook}
            disabled={bookSubmitting}
            className="tx-cab-cta"
          >
            {bookSubmitting
              ? 'Создаём бронь…'
              : `Оплатить в CryptoBot · ${selectedTariff.toUpperCase()}`}
          </button>
          <div className="tx-cab-pay-hint">
            Оплата в USDT / TON через @CryptoBot. Карта RU скоро.
          </div>
        </section>
      ) : null}

      {bookings && bookings.length > 1 ? (
        <section className="tx-cab-section">
          <h2 className="tx-cab-h2">История</h2>
          <BookingsList bookings={bookings} />
        </section>
      ) : null}

      {bookingsError ? (
        <div className="tx-cab-error">
          Не удалось загрузить бронирования: {bookingsError}
        </div>
      ) : null}
    </>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
