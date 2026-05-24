import { useEffect } from 'react';
import { NavBar } from '../components/NavBar';
import { HowItWorks } from '../sections/HowItWorks';
import { EscrowFlow } from '../sections/EscrowFlow';
import { TrustDelivery } from '../sections/TrustDelivery';
import { ProblemsWeSolve } from '../sections/ProblemsWeSolve';
import { PageChat } from '../components/PageChat';
import { useLang, useT } from '../i18n/LangContext';
import { ORG_JSONLD, useHead } from '../lib/useHead';

const SECTIONS = [
  { id: 'how',      label: 'Four-step flow — brief, operator, delivery, payout' },
  { id: 'escrow',   label: 'Escrow + 14-day safe contract, yield mechanics, disputes' },
  { id: 'trust',    label: 'Trust + delivery guarantees' },
  { id: 'problems', label: 'Problems we solve (failure modes of solo AI work)' },
];

export function HowPage() {
  const { lang } = useLang();
  const t = useT();
  useHead({
    title: t('seo.how.title'),
    description: t('seo.how.desc'),
    path: '/how',
    lang,
    jsonLd: [ORG_JSONLD],
  });
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <>
      <NavBar />
      <main>
        <h1 className="sr-only">{t('seo.how.title')}</h1>
        <HowItWorks />
        <EscrowFlow />
        <TrustDelivery />
        <ProblemsWeSolve />
        <PageChat intent="how_deep" page="/how" sections={SECTIONS} />
      </main>
    </>
  );
}

export default HowPage;
