import { useEffect } from 'react';
import { NavBar } from '../components/NavBar';
import { TokenPreLaunch } from '../sections/TokenPreLaunch';
import { TokenTrust } from '../sections/TokenTrust';
import { PageChat } from '../components/PageChat';
import { useLang, useT } from '../i18n/LangContext';
import { ORG_JSONLD, useHead } from '../lib/useHead';

const SECTIONS = [
  { id: 'token',       label: '$FLOW pre-launch — supply, utility, launch window' },
  { id: 'trust-token', label: 'Token trust — anti-rug, vesting, on-chain proofs' },
];

export function TokenPage() {
  const { lang } = useLang();
  const t = useT();
  useHead({
    title: t('seo.token.title'),
    description: t('seo.token.desc'),
    path: '/token',
    lang,
    jsonLd: [ORG_JSONLD],
  });
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <>
      <NavBar />
      <main>
        <h1 className="sr-only">{t('seo.token.title')}</h1>
        <TokenPreLaunch />
        <TokenTrust />
        <PageChat intent="token_deep" page="/token" sections={SECTIONS} />
      </main>
    </>
  );
}

export default TokenPage;
