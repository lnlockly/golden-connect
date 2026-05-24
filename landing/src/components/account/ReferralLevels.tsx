import { useT } from '../../i18n/LangContext';
import './ReferralLevels.css';

/**
 * ReferralLevels — 5-level deep income breakdown. Table shows %, count
 * of users at each level and this-month earnings. All mock until the
 * backend endpoint lands.
 */

interface LevelRow {
  level: 1 | 2 | 3 | 4 | 5;
  pct: number;
  count: number;
  earnedMonth: number;
}

const MOCK_LEVELS: LevelRow[] = [
  { level: 1, pct: 5, count: 3,   earnedMonth: 6.00 },
  { level: 2, pct: 4, count: 12,  earnedMonth: 4.80 },
  { level: 3, pct: 3, count: 47,  earnedMonth: 7.05 },
  { level: 4, pct: 2, count: 105, earnedMonth: 4.20 },
  { level: 5, pct: 1, count: 200, earnedMonth: 2.00 },
];

export function ReferralLevels() {
  const t = useT();
  const total = MOCK_LEVELS.reduce((s, r) => s + r.earnedMonth, 0);
  const totalPeople = MOCK_LEVELS.reduce((s, r) => s + r.count, 0);

  return (
    <div className="af-acc-cell af-reflvl">
      <div className="af-acc-section-head">
        <h2 className="af-acc-section-title">{t('dash.reflvl_title')}</h2>
        <span className="af-acc-section-sub">{t('dash.reflvl_sub')}</span>
      </div>

      <table className="af-reflvl-table">
        <thead>
          <tr>
            <th>{t('dash.reflvl_col_level')}</th>
            <th>{t('dash.reflvl_col_pct')}</th>
            <th>{t('dash.reflvl_col_count')}</th>
            <th>{t('dash.reflvl_col_month')}</th>
          </tr>
        </thead>
        <tbody>
          {MOCK_LEVELS.map((r) => (
            <tr key={r.level}>
              <td className="af-reflvl-level">L{r.level}</td>
              <td className="af-reflvl-pct">{r.pct}%</td>
              <td className="af-reflvl-count">
                {r.count.toLocaleString('ru-RU')}
              </td>
              <td className="af-reflvl-month">${r.earnedMonth.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>{t('dash.reflvl_total')}</td>
            <td>—</td>
            <td>{totalPeople.toLocaleString('ru-RU')}</td>
            <td>${total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <p className="af-reflvl-foot">{t('dash.reflvl_foot')}</p>
    </div>
  );
}
