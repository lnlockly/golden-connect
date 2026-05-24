import { useEffect } from 'react';
import { NavBar } from '../components/NavBar';
import { InvestorCapsule } from '../sections/InvestorCapsule';
import { PageChat } from '../components/PageChat';
import { useLang, useT } from '../i18n/LangContext';
import { ORG_JSONLD, useHead } from '../lib/useHead';

const goWith = (intent: string) => () => {
  window.location.href = `/?intent=${intent}`;
};

// Anchors that actually render in the DOM today. Backend may also
// route users to /token or /whitepaper sections via `nav:` lines.
const SECTIONS = [
  { id: 'investors', label: 'Investor capsule (KPIs + milestones + CTA)' },
];

export function InvestorsPage() {
  const { lang } = useLang();
  const t = useT();
  useHead({
    title: t('seo.investors.title'),
    description: t('seo.investors.desc'),
    path: '/investors',
    lang,
    jsonLd: [ORG_JSONLD],
  });
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <>
      <NavBar />
      <main>
        <h1 className="sr-only">{t('seo.investors.title')}</h1>
        <InvestorCapsule onOrder={goWith('investor')} />
        <PageChat intent="investor_deep" page="/investors" sections={SECTIONS} />
      </main>
    </>
  );
}

export default InvestorsPage;
