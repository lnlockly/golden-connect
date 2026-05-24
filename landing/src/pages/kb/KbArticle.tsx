import { Suspense, lazy, useEffect, useMemo, useState, type ComponentType } from 'react';
import { Link, useParams } from 'react-router-dom';
import { NavBar } from '../../components/NavBar';
import { useLang, useT, type Lang } from '../../i18n/LangContext';
import { ORG_JSONLD, useHead } from '../../lib/useHead';

type KbDoc = {
  slug: string;
  lang: string;
  title: string;
  summary: string;
  category: string;
  order: number;
  updated: string;
  body_stripped: string;
};

// Vite turns this glob into a map of lazy loaders at build time. Keys
// are relative paths like '../../../content/kb/escrow.en.mdx' — we
// look up by (slug, lang) with an English fallback.
const MDX_MODULES = import.meta.glob<{ default: ComponentType }>(
  '../../../content/kb/*.mdx',
);

function pickLoader(slug: string, lang: Lang) {
  const exact = `../../../content/kb/${slug}.${lang}.mdx`;
  if (MDX_MODULES[exact]) return MDX_MODULES[exact];
  const fallback = `../../../content/kb/${slug}.en.mdx`;
  if (MDX_MODULES[fallback]) return MDX_MODULES[fallback];
  return null;
}

export function KbArticle() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { lang } = useLang();
  const t = useT();

  const [meta, setMeta] = useState<KbDoc | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tryFetch = async (l: Lang): Promise<KbDoc | null> => {
        try {
          const res = await fetch(`/kb-index.${l}.json`);
          if (!res.ok) return null;
          const docs = (await res.json()) as KbDoc[];
          return docs.find((d) => d.slug === slug) ?? null;
        } catch {
          return null;
        }
      };
      const found = (await tryFetch(lang)) ?? (await tryFetch('en'));
      if (!cancelled) setMeta(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, lang]);

  useHead({
    title: meta?.title ? `${meta.title} — Golden Connect` : t('kb.title'),
    description: meta?.summary || t('kb.search_placeholder'),
    path: `/kb/${slug}`,
    lang,
    jsonLd: [ORG_JSONLD],
  });

  const MdxComponent = useMemo(() => {
    const loader = pickLoader(slug, lang);
    if (!loader) return null;
    return lazy(loader);
  }, [slug, lang]);

  return (
    <>
      <NavBar />
      <main className="kb-article">
        <div className="kb-article__nav">
          <Link to="/kb" className="kb-article__back">
            ← {t('kb.back_to_index')}
          </Link>
        </div>

        {meta && (
          <header className="kb-article__header">
            <h1 className="kb-article__title">{meta.title}</h1>
            {meta.summary && (
              <p className="kb-article__summary">{meta.summary}</p>
            )}
            {meta.updated && (
              <p className="kb-article__meta">
                {t('kb.updated')} · {meta.updated}
              </p>
            )}
          </header>
        )}

        <article className="kb-article__body">
          {MdxComponent ? (
            <Suspense fallback={<div className="kb-article__loading">…</div>}>
              <MdxComponent />
            </Suspense>
          ) : (
            <p className="kb-empty">{t('kb.no_results')}</p>
          )}
        </article>
      </main>
    </>
  );
}

export default KbArticle;
