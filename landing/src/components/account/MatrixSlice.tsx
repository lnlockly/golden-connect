import { useT } from '../../i18n/LangContext';
import './MatrixSlice.css';

/**
 * MatrixSlice — visualizes the user's Monar queue cycle. Each lot opens
 * N business places (15 for a $500 lot). Every place accepts $10 twice:
 * first $10 → 60% to user ($6) + 40% to system funds; second $10 →
 * reinvest (place rejoins the end of the chain). When all places have
 * cycled and the user has earned +100% of the lot, the lot closes.
 *
 * Source: ops/trendex-migration/monar-13-series-source.md.
 * Mock data until the Monar backend ships.
 */

// Mock data — represents an active $500 lot mid-cycle.
const MOCK_LOT_USD = 500;
const MOCK_PLACES_TOTAL = 15;          // bizPlaces for $500 lot
const MOCK_PLACES_FILLED = 9;          // places already cycled once
const MOCK_PLACES_REINVESTED = 4;      // places that took the second $10
const MOCK_EARNED_USD = 187.5;         // out of $500 target
const MOCK_LOT_TARGET_USD = 500;       // +100% of lot
const MOCK_REFS_PAID_THIS_CYCLE = 23;  // ref payouts this cycle

export function MatrixSlice() {
  const t = useT();

  const pct = Math.min(100, Math.round((MOCK_EARNED_USD / MOCK_LOT_TARGET_USD) * 100));

  // Build 15 place dots, each in one of: cycled / reinvested / queued.
  const places = Array.from({ length: MOCK_PLACES_TOTAL }, (_, i) => {
    let state: 'reinvested' | 'cycled' | 'queued';
    if (i < MOCK_PLACES_REINVESTED) state = 'reinvested';
    else if (i < MOCK_PLACES_FILLED) state = 'cycled';
    else state = 'queued';
    return { idx: i + 1, state };
  });

  return (
    <div className="af-acc-cell af-matrix">
      <div className="af-acc-section-head">
        <h2 className="af-acc-section-title">
          {t('dash.matrix_title') || 'Цикл лота'}
        </h2>
        <span className="af-acc-section-sub">
          {t('dash.matrix_sub') || `Лот $${MOCK_LOT_USD} · ${MOCK_PLACES_TOTAL} бизнес-мест`}
        </span>
      </div>

      <div className="af-matrix-body">
        <div className="af-matrix-position">
          <div className="af-matrix-position-label">
            {t('dash.matrix_place_label') || 'Доход цикла'}
          </div>
          <div className="af-matrix-position-value">
            <span className="af-matrix-position-hash">$</span>
            {MOCK_EARNED_USD.toFixed(2)}
          </div>
          <div className="af-matrix-position-sub">
            {t('dash.matrix_place_sub') ||
              `${pct}% до удвоения · цель $${MOCK_LOT_TARGET_USD}`}
          </div>
        </div>

        <div className="af-matrix-above">
          <div className="af-matrix-group-head">
            <span>{t('dash.matrix_above') || 'Места в цепочке'}</span>
            <em>
              {t('dash.matrix_above_hint') ||
                'каждое место принимает $10 дважды: 60% тебе + 40% в фонды, затем реинвест'}
            </em>
          </div>

          <ol className="af-matrix-above-list af-matrix-chain">
            {places.map((p) => (
              <li
                key={p.idx}
                className={`af-matrix-above-row af-matrix-place af-matrix-place--${p.state}`}
              >
                <span className="af-matrix-lvl">№{p.idx}</span>
                <span className="af-matrix-alias">
                  {p.state === 'reinvested' && 'Реинвест ($10 в конец цепи)'}
                  {p.state === 'cycled' && 'Прошло круг (+$6 тебе)'}
                  {p.state === 'queued' && 'Ждёт входа $10'}
                </span>
                <span className={`af-matrix-plan af-matrix-plan--${p.state}`}>
                  {p.state === 'reinvested' && '×2'}
                  {p.state === 'cycled' && '×1'}
                  {p.state === 'queued' && '—'}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="af-matrix-below">
          <div className="af-matrix-below-value">
            {MOCK_REFS_PAID_THIS_CYCLE}
          </div>
          <div className="af-matrix-below-label">
            {t('dash.matrix_below_label') || 'выплат с рефералов за этот цикл (5 уровней)'}
          </div>
        </div>

        <a href="/#how-monar" className="af-matrix-learn">
          {t('dash.matrix_learn') || 'Как работает цикл Monar'} <span aria-hidden>→</span>
        </a>
      </div>
    </div>
  );
}
