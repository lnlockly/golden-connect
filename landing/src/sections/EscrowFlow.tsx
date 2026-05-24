import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';

const STAGES = ['s1', 's2', 's3', 's4', 's5'] as const;
const YIELD_SPLIT: { key: 'op' | 'cl'; pct: number }[] = [
  { key: 'op', pct: 50 },
  { key: 'cl', pct: 50 },
];
const VESTING_DAYS = 14;
const DISPUTE_STEPS = ['step1', 'step2', 'step3'] as const;

export function EscrowFlow() {
  const t = useT();

  return (
    <section id="escrow" className="section-escrow">
      <div className="section-head">
        <Eyebrow k="escrow.eyebrow" />
        <RichText as="h2" className="section-h" k="escrow.h" />
        <p className="section-lede">{t('escrow.lede')}</p>
      </div>

      {/* 5-stage timeline */}
      <div className="esc-timeline" aria-label={t('escrow.stages_label')}>
        <div className="esc-timeline-label">{t('escrow.stages_label')}</div>
        <ol className="esc-stages">
          {STAGES.map((s, i) => (
            <li key={s} className={`esc-stage esc-stage-${i + 1}`}>
              <div className="esc-node">
                <span className="esc-node-dot" />
                <span className="esc-node-line" aria-hidden />
              </div>
              <div className="esc-stage-body">
                <div className="esc-stage-tag">{t(`escrow.${s}.t`)}</div>
                <h4>{t(`escrow.${s}.h`)}</h4>
                <p>{t(`escrow.${s}.p`)}</p>
                {i === 0 && (
                  <span className="esc-deposit-drip">{t('escrow.deposit_drip')}</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Yield split + vesting side-by-side */}
      <div className="esc-split">
        <div className="esc-yield">
          <div className="esc-block-title">{t('escrow.yield.title')}</div>
          <p className="esc-block-lede">{t('escrow.yield.lede')}</p>
          <div className="esc-yield-rows">
            {YIELD_SPLIT.map((y) => (
              <div key={y.key} className={`esc-yield-row y-${y.key}`}>
                <div className="esc-yield-top">
                  <span className="esc-yield-label">{t(`escrow.yield.${y.key}.label`)}</span>
                  <span className="esc-yield-pct">{y.pct}%</span>
                </div>
                <div className="esc-yield-bar">
                  <span className="esc-yield-fill" style={{ width: `${y.pct}%` }} />
                </div>
                <p className="esc-yield-p">{t(`escrow.yield.${y.key}.p`)}</p>
              </div>
            ))}
            <div className="esc-platform-note">
              <div className="esc-platform-top">
                <span className="esc-yield-label">{t('escrow.yield.tr.label')}</span>
                <span className="esc-platform-pct">20% <span className="esc-platform-flat">→ LP</span></span>
              </div>
              <p className="esc-yield-p">{t('escrow.yield.tr.p')}</p>
            </div>
          </div>
        </div>

        <div className="esc-vesting">
          <div className="esc-block-title">{t('escrow.vesting.title')}</div>
          <p className="esc-block-lede">{t('escrow.vesting.lede')}</p>

          <div className="esc-vesting-visual" aria-hidden>
            <div className="esc-vesting-drip">
              {Array.from({ length: VESTING_DAYS }).map((_, i) => (
                <span
                  key={i}
                  className="esc-vesting-day"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </div>
            <div className="esc-vesting-lump">
              <span className="esc-vesting-lump-fill" />
            </div>
          </div>

          <div className="esc-vesting-rows">
            <div className="esc-vesting-summary">
              <span className="esc-vesting-summary-l">{t('escrow.vesting.drip_l')}</span>
              <span className="esc-vesting-summary-v">{t('escrow.vesting.drip_v')}</span>
              <span className="esc-vesting-summary-p">{t('escrow.vesting.drip_p')}</span>
            </div>
            <div className="esc-vesting-summary accent">
              <span className="esc-vesting-summary-l">{t('escrow.vesting.lump_l')}</span>
              <span className="esc-vesting-summary-v">{t('escrow.vesting.lump_v')}</span>
              <span className="esc-vesting-summary-p">{t('escrow.vesting.lump_p')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Dispute card */}
      <div className="esc-dispute">
        <div className="esc-dispute-head">
          <div className="esc-block-title">{t('escrow.dispute.title')}</div>
          <p className="esc-block-lede">{t('escrow.dispute.lede')}</p>
        </div>
        <div className="esc-dispute-steps">
          {DISPUTE_STEPS.map((step, i) => (
            <div key={step} className={`esc-dispute-step ds-${i + 1}`}>
              <div className="esc-dispute-num">{String(i + 1).padStart(2, '0')}</div>
              <div className="esc-dispute-body">
                <h4>{t(`escrow.dispute.${step}_h`)}</h4>
                <p>{t(`escrow.dispute.${step}_p`)}</p>
              </div>
              {i === 1 && (
                <div className="esc-jury" aria-hidden>
                  <span className="esc-juror j1">J1</span>
                  <span className="esc-juror j2">J2</span>
                  <span className="esc-juror j3">J3</span>
                  <span className="esc-admin">A</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
