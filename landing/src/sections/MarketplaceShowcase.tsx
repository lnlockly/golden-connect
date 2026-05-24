import { useT } from '../i18n/LangContext';
import { RichText } from '../components/ui/RichText';
import { Eyebrow } from '../components/ui/Eyebrow';
import { MarketplaceDemo } from '../components/MarketplaceDemo';

interface Props {
  onOrder: () => void;
}

export function MarketplaceShowcase({ onOrder }: Props) {
  const t = useT();
  return (
    <section id="marketplace" className="section-mp">
      <div className="section-head">
        <Eyebrow k="mp.eyebrow" />
        <RichText as="h2" className="section-h" k="mp.h" />
        <p className="section-lede">{t('mp.lede')}</p>
      </div>

      <MarketplaceDemo onHire={onOrder} />

      <div className="mp-callouts">
        <div className="mp-callout">
          <div className="mp-callout-n">20%</div>
          <div className="mp-callout-l">{t('mp.c1')}</div>
        </div>
        <div className="mp-callout">
          <div className="mp-callout-n">24/7</div>
          <div className="mp-callout-l">{t('mp.c2')}</div>
        </div>
        <div className="mp-callout">
          <div className="mp-callout-n">$10+</div>
          <div className="mp-callout-l">{t('mp.c3')}</div>
        </div>
        <div className="mp-callout">
          <div className="mp-callout-n">2-of-3</div>
          <div className="mp-callout-l">{t('mp.c4')}</div>
        </div>
      </div>
    </section>
  );
}
