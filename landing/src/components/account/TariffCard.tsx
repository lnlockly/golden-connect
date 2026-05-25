import { useEffect, useState } from 'react';
import { useT } from '../../i18n/LangContext';
import './TariffCard.css';

/**
 * TariffCard — shows the user's current Monar lot, doubling progress
 * (income earned vs. lot price), days remaining, ads-package status.
 * Clicking "change lot" opens a modal with all 5 Monar lots and an
 * Activate CTA. Backend isn't wired yet, so Activate currently toasts a
 * placeholder and closes.
 *
 * Source of truth for numbers: ops/trendex-migration/monar-13-series-source.md.
 * All data below is mock until the Monar backend ships.
 */

export type LotId = 'l50' | 'l100' | 'l300' | 'l500' | 'l1000';

export interface MonarLot {
  id: LotId;
  /** Lot price in USD — also doubled when the lot closes. */
  entryUsd: number;
  /** Business places the lot opens (each accepts $10 twice). */
  bizPlaces: number;
  /** Days until lot closes (yields +100% income). */
  daysToDouble: number;
  /** Cycles the lot performs over its lifetime. */
  cycles: number;
  /** Weekly abonentka (0.5% of lot) — funds extra technical places. */
  weeklyFeeUsd: number;
  /** Ad-package: posts/week × weeks. $50 lot is a one-off single post. */
  adsPerWeek: number;
  adsWeeks: number;
  /** World-pool buckets the lot taps into (0 = no world pool). */
  worldPoolBuckets: number;
}

export const MONAR_LOTS: MonarLot[] = [
  { id: 'l50',   entryUsd: 50,   bizPlaces: 2,  daysToDouble: 90, cycles: 17, weeklyFeeUsd: 0.25, adsPerWeek: 1,  adsWeeks: 0,  worldPoolBuckets: 0 },
  { id: 'l100',  entryUsd: 100,  bizPlaces: 4,  daysToDouble: 85, cycles: 15, weeklyFeeUsd: 0.50, adsPerWeek: 1,  adsWeeks: 4,  worldPoolBuckets: 0 },
  { id: 'l300',  entryUsd: 300,  bizPlaces: 9,  daysToDouble: 75, cycles: 14, weeklyFeeUsd: 1.50, adsPerWeek: 3,  adsWeeks: 12, worldPoolBuckets: 1 },
  { id: 'l500',  entryUsd: 500,  bizPlaces: 15, daysToDouble: 65, cycles: 12, weeklyFeeUsd: 2.50, adsPerWeek: 5,  adsWeeks: 20, worldPoolBuckets: 3 },
  { id: 'l1000', entryUsd: 1000, bizPlaces: 32, daysToDouble: 40, cycles: 7,  weeklyFeeUsd: 5.00, adsPerWeek: 10, adsWeeks: 50, worldPoolBuckets: 8 },
];

// Backward-compat re-export so any old callers keep importing.
export const GOLDEN_CONNECT_TARIFFS = MONAR_LOTS;
export type Tariff = MonarLot;

// Mock user state — wire to API later.
const MOCK_USER_LOT: LotId = 'l500';
const MOCK_INCOME_USD = 187.5; // earned so far in this lot cycle
const MOCK_DAYS_LEFT = 27;
const MOCK_CLOSES_DATE_LABEL = '21 июля';

function lotName(id: LotId): string {
  const lot = MONAR_LOTS.find((x) => x.id === id);
  return lot ? `Лот $${lot.entryUsd}` : 'Лот';
}

export function TariffCard() {
  const t = useT();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const current = MONAR_LOTS.find((x) => x.id === MOCK_USER_LOT) ?? MONAR_LOTS[0];
  const incomeNow = MOCK_INCOME_USD;
  const target = current.entryUsd; // +100% to lot price
  const pct = Math.min(100, Math.round((incomeNow / target) * 100));

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  return (
    <div className="af-acc-cell af-tariff">
      <div className="af-acc-section-head">
        <h2 className="af-acc-section-title">{t('dash.tariff_title') || 'Активный лот'}</h2>
        <span className="af-acc-section-sub">{lotName(current.id)}</span>
      </div>

      <div className="af-tariff-body">
        <div className="af-tariff-name-row">
          <div className="af-tariff-name">{lotName(current.id)}</div>
          <div className="af-tariff-entry">
            {current.bizPlaces} бизнес-мест · ~{current.daysToDouble} дней до ×2
          </div>
        </div>

        <div className="af-tariff-progress">
          <div className="af-tariff-progress-head">
            <span className="af-tariff-progress-label">
              {t('dash.tariff_today') || 'Доход цикла'}
            </span>
            <span className="af-tariff-progress-value">
              ${incomeNow.toFixed(2)} <em>/ ${target}</em>
            </span>
          </div>
          <div className="af-tariff-bar">
            <div
              className="af-tariff-bar-fill"
              style={{ width: pct + '%' }}
              aria-hidden
            />
          </div>
          <div className="af-tariff-progress-foot">
            {pct >= 100
              ? 'Лот закрыт. Активируй новый ≥ 50% дохода — откроется вывод.'
              : `Осталось $${(target - incomeNow).toFixed(2)} до удвоения · ${MOCK_DAYS_LEFT} дн.`}
          </div>
        </div>

        <div className="af-tariff-renewal">
          <span className="af-tariff-renewal-label">Лот закроется</span>
          <span className="af-tariff-renewal-value">
            ~{MOCK_CLOSES_DATE_LABEL} · удвоение ${target} → ${target * 2}
          </span>
        </div>

        <button
          type="button"
          className="af-tariff-change"
          onClick={() => setPickerOpen(true)}
        >
          {t('dash.tariff_change_cta') || 'Сменить лот'} <span aria-hidden>→</span>
        </button>
      </div>

      {pickerOpen && (
        <LotPickerModal
          currentId={current.id}
          onClose={() => setPickerOpen(false)}
          onPick={(_id) => {
            setPickerOpen(false);
            showToast(t('dash.tariff_pick_stub') || 'Лот активируется после оплаты');
          }}
        />
      )}

      {toast && (
        <div className="af-tariff-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}

function LotPickerModal({
  currentId,
  onClose,
  onPick,
}: {
  currentId: LotId;
  onClose: () => void;
  onPick: (id: LotId) => void;
}) {
  const t = useT();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="af-tariff-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="af-tariff-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="af-tariff-modal-head">
          <h3>{t('dash.picker_title') || 'Выбери лот Monar'}</h3>
          <button
            type="button"
            className="af-tariff-modal-close"
            onClick={onClose}
            aria-label={t('dash.close') || 'Закрыть'}
          >
            ×
          </button>
        </div>
        <div className="af-tariff-modal-sub">
          {t('dash.picker_sub') ||
            '5 лотов · 60% / 40% на каждом месте · удвоение за 40–90 дней'}
        </div>
        <div className="af-tariff-modal-body">
          {MONAR_LOTS.map((lot) => {
            const isCurrent = lot.id === currentId;
            return (
              <div
                key={lot.id}
                className={'af-tariff-row' + (isCurrent ? ' is-current' : '')}
              >
                <div className="af-tariff-row-id">{lotName(lot.id)}</div>
                <div className="af-tariff-row-col">
                  <span className="af-tariff-row-k">Бизнес-мест</span>
                  <span className="af-tariff-row-v">{lot.bizPlaces}</span>
                </div>
                <div className="af-tariff-row-col">
                  <span className="af-tariff-row-k">Удвоение</span>
                  <span className="af-tariff-row-v">~{lot.daysToDouble} дн.</span>
                </div>
                <div className="af-tariff-row-col">
                  <span className="af-tariff-row-k">Кругов</span>
                  <span className="af-tariff-row-v">{lot.cycles}</span>
                </div>
                <div className="af-tariff-row-col">
                  <span className="af-tariff-row-k">Реклама</span>
                  <span className="af-tariff-row-v">
                    {lot.adsWeeks > 0
                      ? `${lot.adsPerWeek}/нед × ${lot.adsWeeks} нед`
                      : `${lot.adsPerWeek} пост разово`}
                  </span>
                </div>
                <div className="af-tariff-row-col">
                  <span className="af-tariff-row-k">Мировой пул</span>
                  <span className="af-tariff-row-v">
                    {lot.worldPoolBuckets > 0 ? `${lot.worldPoolBuckets} из 8` : '—'}
                  </span>
                </div>
                <button
                  type="button"
                  className="af-tariff-row-cta"
                  disabled={isCurrent}
                  onClick={() => onPick(lot.id)}
                >
                  {isCurrent
                    ? t('dash.picker_current') || 'Текущий'
                    : t('dash.picker_activate') || 'Активировать'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
