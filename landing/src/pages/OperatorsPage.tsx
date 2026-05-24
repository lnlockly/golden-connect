import { useEffect } from 'react';
import { NavBar } from '../components/NavBar';
import { OperatorSupply } from '../sections/OperatorSupply';
import { PageChat } from '../components/PageChat';
import { useLang, useT } from '../i18n/LangContext';
import { ORG_JSONLD, useHead } from '../lib/useHead';

const goWith = (intent: string) => () => {
  window.location.href = `/?intent=${intent}`;
};

const SECTIONS = [
  { id: 'operators', label: 'Operator supply — apply, curriculum, earnings, dispute duty' },
];

export function OperatorsPage() {
  const { lang } = useLang();
  const t = useT();
  useHead({
    title: t('seo.operators.title'),
    description: t('seo.operators.desc'),
    path: '/operators',
    lang,
    jsonLd: [ORG_JSONLD],
  });
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <>
      <NavBar />
      <main>
        <h1 className="sr-only">{t('seo.operators.title')}</h1>
        <OperatorSupply onOrder={goWith('operator')} />
        <PageChat intent="operators_deep" page="/operators" sections={SECTIONS} />
      </main>
    </>
  );
}

export default OperatorsPage;
