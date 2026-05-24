import { useEffect } from 'react';
import { NavBar } from '../components/NavBar';
import { useLang, useT } from '../i18n/LangContext';
import { PageChat } from '../components/PageChat';
import { ORG_JSONLD, useHead } from '../lib/useHead';

const SECTIONS = [
  { id: 'marketing-hero',  label: 'Growth story — AI-driven traffic loop' },
  { id: 'marketing-grid',  label: 'Four growth levers (network, exchanges, tokens, creators)' },
];

/**
 * Marketing page. Holds the growth-engine narrative (network
 * marketers, exchanges, community tokens, AI-driven traffic). Plain
 * copy, no charts, no mock numbers — just the story.
 */
export function MarketingPage() {
  const t = useT();
  const { lang } = useLang();
  useHead({
    title: t('seo.marketing.title'),
    description: t('seo.marketing.desc'),
    path: '/marketing',
    lang,
    jsonLd: [ORG_JSONLD],
  });

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <>
      <NavBar />
      <main className="page-marketing">

        <section id="marketing-hero" className="page-marketing-hero">
          <div className="section-head">
            <div className="page-marketing-eyebrow">{t('marketing.eyebrow')}</div>
            <h1 className="page-marketing-h">{t('marketing.h')}</h1>
            <p className="page-marketing-lede">{t('marketing.lede')}</p>
          </div>
        </section>

        <section id="marketing-grid" className="page-marketing-grid">
          <article className="page-marketing-card">
            <div className="page-marketing-num">01</div>
            <h3>{t('marketing.b1.h')}</h3>
            <p>{t('marketing.b1.p')}</p>
          </article>
          <article className="page-marketing-card">
            <div className="page-marketing-num">02</div>
            <h3>{t('marketing.b2.h')}</h3>
            <p>{t('marketing.b2.p')}</p>
          </article>
          <article className="page-marketing-card">
            <div className="page-marketing-num">03</div>
            <h3>{t('marketing.b3.h')}</h3>
            <p>{t('marketing.b3.p')}</p>
          </article>
          <article className="page-marketing-card">
            <div className="page-marketing-num">04</div>
            <h3>{t('marketing.b4.h')}</h3>
            <p>{t('marketing.b4.p')}</p>
          </article>
        </section>

        <PageChat intent="marketing_deep" page="/marketing" sections={SECTIONS} />
      </main>
    </>
  );
}

export default MarketingPage;
