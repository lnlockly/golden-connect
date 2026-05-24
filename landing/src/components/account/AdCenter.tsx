import { useState } from 'react';
import { useT } from '../../i18n/LangContext';
import './AdCenter.css';

/**
 * AdCenter — dual-mode widget. Viewer watches ads and earns; advertiser
 * tops up a balance and runs campaigns. Toggle is local state only;
 * backend for ad modes lands later.
 */

type AdMode = 'viewer' | 'advertiser';

// Mock numbers.
const MOCK_VIEWER_EARNED_TODAY = 1.20;
const MOCK_VIEWER_ADS_WATCHED = 4;
const MOCK_ADVERTISER_BALANCE = 0.00;

export function AdCenter() {
  const t = useT();
  const [mode, setMode] = useState<AdMode>('viewer');

  return (
    <div className="af-acc-cell af-adcenter">
      <div className="af-acc-section-head">
        <h2 className="af-acc-section-title">{t('dash.ad_title')}</h2>
        <div className="af-adcenter-switch" role="tablist" aria-label={t('dash.ad_title')}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'viewer'}
            className={'af-adcenter-pill' + (mode === 'viewer' ? ' is-active' : '')}
            onClick={() => setMode('viewer')}
          >
            {t('dash.ad_mode_viewer')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'advertiser'}
            className={'af-adcenter-pill' + (mode === 'advertiser' ? ' is-active' : '')}
            onClick={() => setMode('advertiser')}
          >
            {t('dash.ad_mode_advertiser')}
          </button>
        </div>
      </div>

      {mode === 'viewer' ? (
        <div className="af-adcenter-body">
          <div className="af-adcenter-stat">
            <div className="af-adcenter-stat-label">{t('dash.ad_earned_today')}</div>
            <div className="af-adcenter-stat-value">
              ${MOCK_VIEWER_EARNED_TODAY.toFixed(2)}
            </div>
          </div>
          <div className="af-adcenter-stat">
            <div className="af-adcenter-stat-label">{t('dash.ad_watched')}</div>
            <div className="af-adcenter-stat-value subtle">
              {MOCK_VIEWER_ADS_WATCHED}
            </div>
          </div>
          <p className="af-adcenter-hint">{t('dash.ad_viewer_hint')}</p>
        </div>
      ) : (
        <div className="af-adcenter-body">
          <div className="af-adcenter-stat">
            <div className="af-adcenter-stat-label">{t('dash.ad_balance')}</div>
            <div className="af-adcenter-stat-value">
              ${MOCK_ADVERTISER_BALANCE.toFixed(2)}
            </div>
          </div>
          <div className="af-adcenter-actions">
            <button type="button" className="af-adcenter-btn primary" disabled>
              {t('dash.ad_topup')}
            </button>
            <button type="button" className="af-adcenter-btn ghost" disabled>
              {t('dash.ad_create_campaign')} <span aria-hidden>→</span>
            </button>
          </div>
          <p className="af-adcenter-hint">{t('dash.ad_advertiser_hint')}</p>
        </div>
      )}
    </div>
  );
}
