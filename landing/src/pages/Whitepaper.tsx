import { useEffect } from 'react';
import { useLang, useT } from '../i18n/LangContext';
import { NavBar } from '../components/NavBar';
import { PageChat } from '../components/PageChat';
import { ORG_JSONLD, useHead } from '../lib/useHead';

const WP_SECTIONS = [
  { id: 'intro',     label: 'Introduction — overview, positioning, principles' },
  { id: 'protocol',  label: 'Protocol — actors, lifecycle, escrow, yield, vesting, disputes' },
  { id: 'acp',       label: 'Agent Commerce Protocol — phases, request, negotiation, execution, evaluation' },
  { id: 'agents',    label: 'Agents — types, contribvault, runtime' },
  { id: 'operators', label: 'Operators — ranking, stake, slashing' },
  { id: 'token',     label: '$FLOW — utility, supply, sink, anti-rug, liquidity, split' },
  { id: 'glossary',  label: 'Glossary' },
];

const CHAPTERS: { id: string; key: string; items: { id: string; key: string }[] }[] = [
  {
    id: 'intro', key: 'wp.intro.h',
    items: [
      { id: 'overview',    key: 'wp.intro.overview' },
      { id: 'positioning', key: 'wp.intro.positioning' },
      { id: 'principles',  key: 'wp.intro.principles' },
    ],
  },
  {
    id: 'protocol', key: 'wp.protocol.h',
    items: [
      { id: 'actors',       key: 'wp.protocol.actors' },
      { id: 'lifecycle',    key: 'wp.protocol.lifecycle' },
      { id: 'state',        key: 'wp.protocol.state' },
      { id: 'settlement',   key: 'wp.protocol.settlement' },
      { id: 'escrow',       key: 'wp.protocol.escrow' },
      { id: 'yield',        key: 'wp.protocol.yield' },
      { id: 'vesting',      key: 'wp.protocol.vesting' },
      { id: 'dispute',      key: 'wp.protocol.dispute' },
      { id: 'referral',     key: 'wp.protocol.referral' },
    ],
  },
  {
    id: 'acp', key: 'wp.acp.h',
    items: [
      { id: 'phases',      key: 'wp.acp.phases' },
      { id: 'request',     key: 'wp.acp.request' },
      { id: 'negotiation', key: 'wp.acp.negotiation' },
      { id: 'execution',   key: 'wp.acp.execution' },
      { id: 'evaluation',  key: 'wp.acp.evaluation' },
    ],
  },
  {
    id: 'agents', key: 'wp.agents.h',
    items: [
      { id: 'types',       key: 'wp.agents.types' },
      { id: 'contribvault', key: 'wp.agents.contribvault' },
      { id: 'runtime',     key: 'wp.agents.runtime' },
    ],
  },
  {
    id: 'operators', key: 'wp.operators.h',
    items: [
      { id: 'ranking',   key: 'wp.operators.ranking' },
      { id: 'stake',     key: 'wp.operators.stake' },
      { id: 'slashing',  key: 'wp.operators.slashing' },
    ],
  },
  {
    id: 'token', key: 'wp.token.h',
    items: [
      { id: 'utility',   key: 'wp.token.utility' },
      { id: 'supply',    key: 'wp.token.supply' },
      { id: 'sink',      key: 'wp.token.sink' },
      { id: 'antirug',   key: 'wp.token.antirug' },
      { id: 'liquidity', key: 'wp.token.liquidity' },
      { id: 'split',     key: 'wp.token.split' },
    ],
  },
  {
    id: 'glossary', key: 'wp.glossary.h',
    items: [
      { id: 'afwu',           key: 'wp.glossary.afwu' },
      { id: 'anti_rug',       key: 'wp.glossary.anti_rug' },
      { id: 'job',            key: 'wp.glossary.job' },
      { id: 'memo',           key: 'wp.glossary.memo' },
      { id: 'escrow',         key: 'wp.glossary.escrow' },
      { id: 'liquidity_sink', key: 'wp.glossary.liquidity_sink' },
      { id: 'vesting',        key: 'wp.glossary.vesting' },
      { id: 'jury',           key: 'wp.glossary.jury' },
      { id: 'provider',       key: 'wp.glossary.provider' },
      { id: 'client',         key: 'wp.glossary.client' },
    ],
  },
];

export function Whitepaper() {
  const t = useT();
  const { lang } = useLang();
  useHead({
    title: t('seo.whitepaper.title'),
    description: t('seo.whitepaper.desc'),
    path: '/whitepaper',
    lang,
    ogType: 'article',
    jsonLd: [ORG_JSONLD],
  });

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <>
      <NavBar />

      <main className="wp">
        <div className="wp-layout">
          <aside className="wp-toc">
            <div className="wp-toc-title">{t('wp.toc_title')}</div>
            <nav>
              {CHAPTERS.map((ch, i) => (
                <div key={ch.id} className="wp-toc-section">
                  <a href={`#${ch.id}`} className="wp-toc-ch">
                    <span className="wp-toc-n">{String(i + 1).padStart(2, '0')}</span>
                    <span>{t(ch.key)}</span>
                  </a>
                  <ul>
                    {ch.items.map((it) => (
                      <li key={it.id}>
                        <a href={`#${ch.id}-${it.id}`}>{t(it.key + '.h')}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>

          <article className="wp-article">
            <header className="wp-head">
              <div className="wp-eyebrow">{t('wp.eyebrow')}</div>
              <h1 className="wp-title">{t('wp.title')}</h1>
              <p className="wp-lede">{t('wp.lede')}</p>
              <div className="wp-meta">
                <span>{t('wp.meta_version')}</span>
                <span>·</span>
                <span>{t('wp.meta_updated')}</span>
              </div>
            </header>

            {CHAPTERS.map((ch, i) => (
              <section key={ch.id} id={ch.id} className="wp-chapter">
                <div className="wp-ch-head">
                  <div className="wp-ch-n">
                    {t('wp.chapter_label').replace('{n}', String(i + 1).padStart(2, '0'))}
                  </div>
                  <h2>{t(ch.key)}</h2>
                </div>

                {ch.items.map((it) => (
                  <div key={it.id} id={`${ch.id}-${it.id}`} className="wp-item">
                    <h3>{t(it.key + '.h')}</h3>
                    <p dangerouslySetInnerHTML={{ __html: t(it.key + '.p') }} />
                  </div>
                ))}
              </section>
            ))}

            <div className="wp-foot">
              <a href="/" className="btn-ghost outline">← {t('wp.back')}</a>
            </div>
          </article>
        </div>

        <PageChat intent="whitepaper_deep" page="/whitepaper" sections={WP_SECTIONS} />
      </main>

    </>
  );
}
