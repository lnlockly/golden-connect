import { useEffect } from 'react';
import { NavBar } from '../components/NavBar';
import { ForAnyBusiness } from '../sections/ForAnyBusiness';
import { IndustryManifesto } from '../sections/IndustryManifesto';
import { AgentGrowth } from '../sections/AgentGrowth';
import { LaunchYourProject } from '../sections/LaunchYourProject';
import { PageChat } from '../components/PageChat';
import { useLang, useT } from '../i18n/LangContext';
import { ORG_JSONLD, useHead } from '../lib/useHead';

const goWith = (intent: string) => () => {
  window.location.href = `/?intent=${intent}`;
};

const SECTIONS = [
  { id: 'business',   label: 'Verticals we ship (landing, bots, ads, design, ops…)' },
  { id: 'manifesto',  label: 'Industry manifesto — why agent-native work' },
  { id: 'growth',     label: 'Agent growth loop' },
  { id: 'launch',     label: 'Launch your project — start a pilot' },
];

export function BusinessPage() {
  const { lang } = useLang();
  const t = useT();
  useHead({
    title: t('seo.business.title'),
    description: t('seo.business.desc'),
    path: '/business',
    lang,
    jsonLd: [ORG_JSONLD],
  });
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <>
      <NavBar />
      <main>
        <h1 className="sr-only">{t('seo.business.title')}</h1>
        <ForAnyBusiness onOrder={goWith('order')} />
        <IndustryManifesto />
        <AgentGrowth />
        <LaunchYourProject onOrder={goWith('order')} />
        <PageChat intent="business_deep" page="/business" sections={SECTIONS} />
      </main>
    </>
  );
}

export default BusinessPage;
