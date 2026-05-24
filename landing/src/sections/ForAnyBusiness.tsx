import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';

const VERTICALS = [
  { k: 'b1', m: 'LP' },
  { k: 'b2', m: 'TG' },
  { k: 'b3', m: 'AD' },
  { k: 'b4', m: 'DE' },
  { k: 'b5', m: 'RE' },
  { k: 'b6', m: 'SA' },
  { k: 'b7', m: 'CR' },
  { k: 'b8', m: 'FI' },
  { k: 'b9', m: 'LG' },
  { k: 'b10', m: 'MU' },
  { k: 'b11', m: 'ED' },
  { k: 'b12', m: 'FR' },
];

interface Props {
  onOrder: () => void;
}

export function ForAnyBusiness({ onOrder }: Props) {
  const t = useT();
  return (
    <section id="business" className="section-biz">
      <div className="section-head">
        <Eyebrow k="biz.eyebrow" />
        <RichText as="h2" className="section-h" k="biz.h" />
        <p className="section-lede">{t('biz.lede')}</p>
      </div>

      <div className="biz-grid">
        {VERTICALS.map((v) => (
          <button
            key={v.k}
            type="button"
            className="biz-card"
            onClick={onOrder}
          >
            <div className="biz-mark">{v.m}</div>
            <div className="biz-body">
              <h4>{t(`biz.${v.k}.h`)}</h4>
              <p>{t(`biz.${v.k}.p`)}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="biz-callout">
        <div className="biz-callout-text">
          <div className="biz-callout-label">{t('biz.callout_l')}</div>
          <RichText as="p" className="biz-callout-body" k="biz.callout_p" />
        </div>
        <button type="button" className="btn-primary" onClick={onOrder}>
          {t('biz.callout_cta')}
          <span className="btn-caret">→</span>
        </button>
      </div>
    </section>
  );
}
