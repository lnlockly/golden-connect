import { useMemo } from 'react';
import { NavBar } from './components/NavBar';
import { Footer } from './components/Footer';
import { HeroMatrix } from './sections/trandx/HeroMatrix';
import { Tariffs } from './sections/trandx/Tariffs';
import { HowMatrix } from './sections/trandx/HowMatrix';
import { EarningSources } from './sections/trandx/EarningSources';
import { Tasks } from './sections/trandx/Tasks';
import { AdViewerAdvertiser } from './sections/trandx/AdViewerAdvertiser';
import { PreStartAdvantages } from './sections/trandx/PreStartAdvantages';
import { Faq } from './sections/trandx/Faq';
import { FinalCta } from './sections/trandx/FinalCta';
import { useLang, useT } from './i18n/LangContext';
import { ORG_JSONLD, WEBSITE_JSONLD, useHead } from './lib/useHead';

function Shell() {
  const { lang } = useLang();
  const t = useT();

  const jsonLd = useMemo(() => [ORG_JSONLD, WEBSITE_JSONLD], []);
  useHead({
    title: t('seo.home.title'),
    description: t('seo.home.desc'),
    path: '/',
    lang,
    jsonLd,
  });

  return (
    <>
      <NavBar />

      <main>
        <HeroMatrix />
        <Tariffs />
        <HowMatrix />
        <EarningSources />
        <Tasks />
        <AdViewerAdvertiser />
        <PreStartAdvantages />
        <Faq />
        <FinalCta />
      </main>

      <Footer />
    </>
  );
}

export default function App() {
  return <Shell />;
}
