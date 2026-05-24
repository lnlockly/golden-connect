import { useEffect, useState } from 'react';
import { useT } from '../../i18n/LangContext';
import './TariffCard.css';

/**
 * Tariff card — shows the user's current plan, today's earning cap
 * progress, and next renewal date. Clicking "change tariff" opens a
 * modal with all 8 Golden Connect tariffs and an Activate CTA. Backend for
 * plan change isn't wired yet, so Activate currently toasts a
 * placeholder and closes.
 *
 * All data below is mock / hard-coded until the matrix backend ships.
 */

export interface Tariff {
  id: 'free' | 'start' | 'basic' | 'core' | 'pro' | 'elite' | 'vip' | 'royal';
  entryUsd: number;
  dailyCapUsd: number;
}

export const GOLDEN_CONNECT_TARIFFS: Tariff[] = [
  { id: 'free',  entryUsd: 0,    dailyCapUsd: 3   },
  { id: 'start', entryUsd: 30,   dailyCapUsd: 10  },
  { id: 'basic', entryUsd: 60,   dailyCapUsd: 20  },
  { id: 'core',  entryUsd: 100,  dailyCapUsd: 30  },
  { id: 'pro',   entryUsd: 200,  dailyCapUsd: 50  },
  { id: 'elite', entryUsd: 300,  dailyCapUsd: 60  },
  { id: 'vip',   entryUsd: 600,  dailyCapUsd: 70  },
  { id: 'royal', entryUsd: 1000, dailyCapUsd: 100 },
];

// Mock user state — wire to API later.
const MOCK_USER_TARIFF: Tariff['id'] = 'start';
const MOCK_EARNED_TODAY_USD = 7.00;
const MOCK_RENEWAL_DATE_LABEL = '2 мая';

export function TariffCard() {
  const t = useT();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const current = GOLDEN_CONNECT_TARIFFS.find((x) => x.id === MOCK_USER_TARIFF) ?? GOLDEN_CONNECT_TARIFFS[0];
  const earnedToday = MOCK_EARNED_TODAY_USD;
  const cap = current.dailyCapUsd;
  const pct = Math.min(100, Math.round((earnedToday / cap) * 100));

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  return (
    <div className="af-acc-cell af-tariff">
      <div className="af-acc-section-head">
        <h2 className="af-acc-section-title">{t('dash.tariff_title')}</h2>
        <span className="af-acc-section-sub">
          {current.id === 'free'
            ? t('dash.tariff_free_label')
            : t('dash.tariff_name_' + current.id)}
        </span>
      </div>

      <div className="af-tariff-body">
        <div className="af-tariff-name-row">
          <div className="af-tariff-name">
            {current.id === 'free'
              ? t('dash.tariff_free_label')
              : t('dash.tariff_name_' + current.id)}
          </div>
          <div className="af-tariff-entry">
            {current.entryUsd > 0
              ? t('dash.tariff_entry').replace('{n}', String(current.entryUsd))
              : t('dash.tariff_free_entry')}
          </div>
        </div>

        <div className="af-tariff-progress">
          <div className="af-tariff-progress-head">
            <span className="af-tariff-progress-label">
              {t('dash.tariff_today')}
            </span>
            <span className="af-tariff-progress-value">
              ${earnedToday.toFixed(2)} <em>/ ${cap}</em>
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
            {pct >= 100 ? t('dash.tariff_cap_reached') : t('dash.tariff_remaining').replace('{n}', (cap - earnedToday).toFixed(2))}
          </div>
        </div>

        <div className="af-tariff-renewal">
          <span className="af-tariff-renewal-label">{t('dash.tariff_renewal')}</span>
          <span className="af-tariff-renewal-value">
            {t('dash.tariff_renewal_value')
              .replace('{date}', MOCK_RENEWAL_DATE_LABEL)
              .replace('{amount}', String(current.entryUsd))}
          </span>
        </div>

        <button
          type="button"
          className="af-tariff-change"
          onClick={() => setPickerOpen(true)}
        >
          {t('dash.tariff_change_cta')} <span aria-hidden>→</span>
        </button>
      </div>

      {pickerOpen && (
        <TariffPickerModal
          currentId={current.id}
          onClose={() => setPickerOpen(false)}
          onPick={(_id) => {
            setPickerOpen(false);
            showToast(t('dash.tariff_pick_stub'));
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

function TariffPickerModal({
  currentId,
  onClose,
  onPick,
}: {
  currentId: Tariff['id'];
  onClose: () => void;
  onPick: (id: Tariff['id']) => void;
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
          <h3>{t('dash.picker_title')}</h3>
          <button
            type="button"
            className="af-tariff-modal-close"
            onClick={onClose}
            aria-label={t('dash.close')}
          >
            ×
          </button>
        </div>
        <div className="af-tariff-modal-sub">{t('dash.picker_sub')}</div>
        <div className="af-tariff-modal-body">
          {GOLDEN_CONNECT_TARIFFS.map((tar) => {
            const isCurrent = tar.id === currentId;
            return (
              <div
                key={tar.id}
                className={'af-tariff-row' + (isCurrent ? ' is-current' : '')}
              >
                <div className="af-tariff-row-id">
                  {t('dash.tariff_name_' + tar.id)}
                </div>
                <div className="af-tariff-row-col">
                  <span className="af-tariff-row-k">{t('dash.picker_entry')}</span>
                  <span className="af-tariff-row-v">
                    {tar.entryUsd > 0 ? '$' + tar.entryUsd : t('dash.picker_free')}
                  </span>
                </div>
                <div className="af-tariff-row-col">
                  <span className="af-tariff-row-k">{t('dash.picker_cap')}</span>
                  <span className="af-tariff-row-v">${tar.dailyCapUsd}/день</span>
                </div>
                <button
                  type="button"
                  className="af-tariff-row-cta"
                  disabled={isCurrent}
                  onClick={() => onPick(tar.id)}
                >
                  {isCurrent ? t('dash.picker_current') : t('dash.picker_activate')}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
