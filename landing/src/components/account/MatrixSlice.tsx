import { useT } from '../../i18n/LangContext';
import './MatrixSlice.css';

/**
 * MatrixSlice — shows the user's position in the global Golden Connect matrix.
 * Three "above" nodes (who get paid when you activate), downstream
 * counter. All mock data for now.
 */

// Mock data.
const MOCK_POSITION = 1847;
const MOCK_DOWNSTREAM = 47;
const MOCK_ABOVE: Array<{ alias: string; plan: string }> = [
  { alias: '@avsee4',     plan: 'Royal' },
  { alias: '@MLM808',     plan: 'VIP'   },
  { alias: '@danunahuy3', plan: 'Elite' },
];

export function MatrixSlice() {
  const t = useT();

  return (
    <div className="af-acc-cell af-matrix">
      <div className="af-acc-section-head">
        <h2 className="af-acc-section-title">{t('dash.matrix_title')}</h2>
        <span className="af-acc-section-sub">{t('dash.matrix_sub')}</span>
      </div>

      <div className="af-matrix-body">
        <div className="af-matrix-position">
          <div className="af-matrix-position-label">{t('dash.matrix_place_label')}</div>
          <div className="af-matrix-position-value">
            <span className="af-matrix-position-hash">#</span>
            {MOCK_POSITION.toLocaleString('ru-RU')}
          </div>
          <div className="af-matrix-position-sub">{t('dash.matrix_place_sub')}</div>
        </div>

        <div className="af-matrix-above">
          <div className="af-matrix-group-head">
            <span>{t('dash.matrix_above')}</span>
            <em>{t('dash.matrix_above_hint')}</em>
          </div>
          <ul className="af-matrix-above-list">
            {MOCK_ABOVE.map((a, i) => (
              <li key={i} className="af-matrix-above-row">
                <span className="af-matrix-lvl">L{i + 1}</span>
                <span className="af-matrix-alias">{a.alias}</span>
                <span className={`af-matrix-plan af-matrix-plan--${a.plan.toLowerCase()}`}>
                  {a.plan}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="af-matrix-below">
          <div className="af-matrix-below-value">
            {MOCK_DOWNSTREAM.toLocaleString('ru-RU')}
          </div>
          <div className="af-matrix-below-label">{t('dash.matrix_below_label')}</div>
        </div>

        <a href="/#matrix" className="af-matrix-learn">
          {t('dash.matrix_learn')} <span aria-hidden>→</span>
        </a>
      </div>
    </div>
  );
}
