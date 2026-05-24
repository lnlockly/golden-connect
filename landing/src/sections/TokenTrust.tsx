import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';
import { WaitlistButton } from '../components/WaitlistButton';

const SPLIT: { k: 'lp' | 'owner' | 'op'; v: string }[] = [
  { k: 'lp',    v: '20%' },
  { k: 'owner', v: '15–20%' },
  { k: 'op',    v: '60–65%' },
];

const SINKS = ['a', 'b', 'c'] as const;
const CHECKS = ['no_sale', 'no_team_unlock', 'no_admin_mint', 'op_vesting'] as const;

export function TokenTrust() {
  const t = useT();

  return (
    <section id="trust-token" className="section-trust">
      <div className="section-head">
        <Eyebrow k="trust.eyebrow" />
        <RichText as="h2" className="section-h" k="trust.h" />
        <p className="section-lede">{t('trust.lede')}</p>
      </div>

      {/* Money flow: client → escrow → split */}
      <div className="trust-flow">
        <div className="trust-flow-title">{t('trust.flow.title')}</div>

        <div className="trust-flow-stream">
          <div className="trust-flow-node trust-flow-client">
            <div className="tfn-tag">{t('trust.flow.client_l')}</div>
            <div className="tfn-v">{t('trust.flow.client_v')}</div>
          </div>

          <div className="trust-flow-arrow" aria-hidden>→</div>

          <div className="trust-flow-node trust-flow-escrow">
            <div className="tfn-tag">{t('trust.flow.escrow_l')}</div>
            <div className="tfn-v">{t('trust.flow.escrow_v')}</div>
            <div className="tfn-drip">{t('trust.flow.drip')}</div>
          </div>

          <div className="trust-flow-arrow" aria-hidden>→</div>

          <div className="trust-flow-split">
            <div className="tfs-title">{t('trust.flow.split_title')}</div>
            {SPLIT.map((s) => (
              <div key={s.k} className={`tfs-row tfs-${s.k}`}>
                <span className="tfs-v">{s.v}</span>
                <span className="tfs-l">{t(`trust.flow.split.${s.k}_l`)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* LP sink bar: grow-only */}
      <div className="trust-sink">
        <div className="trust-sink-head">
          <div className="esc-block-title">{t('trust.sink.title')}</div>
          <p className="esc-block-lede">{t('trust.sink.lede')}</p>
        </div>

        <div className="trust-sink-bar" aria-hidden>
          <span className="trust-sink-fill" />
        </div>

        <div className="trust-sink-legs">
          {SINKS.map((s) => (
            <div key={s} className={`trust-sink-leg sl-${s}`}>
              <div className="tsl-h">{t(`trust.sink.${s}_l`)}</div>
              <p>{t(`trust.sink.${s}_p`)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Anti-rug checklist */}
      <div className="trust-checks">
        <div className="esc-block-title">{t('trust.checklist.title')}</div>
        <ul className="trust-checks-list">
          {CHECKS.map((c) => (
            <li key={c}>
              <span className="trust-check-mark" aria-hidden>✓</span>
              <span>{t(`trust.checklist.${c}`)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="trust-foot">
        <p className="trust-disclaimer">{t('trust.disclaimer')}</p>
        <WaitlistButton variant="primary" labelKey="trust.cta" />
      </div>
    </section>
  );
}
