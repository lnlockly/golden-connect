import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { NavBar } from '../../components/NavBar';
import { useLang, useT } from '../../i18n/LangContext';
import { ORG_JSONLD, useHead } from '../../lib/useHead';
import kbIndex from '../../../content/kb/_index.json';

// TODO(flexsearch): swap the naive .filter() for a FlexSearch Document
// index once the corpus grows past ~30 articles. Until then the
// build-time kb-index.{lang}.json is small enough to scan in-memory.

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

type IndexJson = {
  categories: Array<{
    id: string;
    title: Record<string, string>;
    slugs: string[];
  }>;
  slugs: Record<string, { category: string; order: number }>;
};

const INDEX = kbIndex as IndexJson;

export function KbIndex() {
  const { lang } = useLang();
  const t = useT();

  useHead({
    title: t('kb.title'),
    description: t('kb.search_placeholder'),
    path: '/kb',
    lang,
    jsonLd: [ORG_JSONLD],
  });

  const [docs, setDocs] = useState<KbDoc[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/kb-index.${lang}.json`);
        if (!res.ok) throw new Error(`kb-index ${lang} ${res.status}`);
        const json = (await res.json()) as KbDoc[];
        if (!cancelled) setDocs(json);
      } catch {
        // Fallback: hit the English index so the route stays usable
        // even if the current locale's index is missing.
        try {
          const res = await fetch('/kb-index.en.json');
          if (res.ok && !cancelled) setDocs((await res.json()) as KbDoc[]);
        } catch {
          if (!cancelled) setDocs([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const filtered = useMemo(() => {
    if (!docs) return null;
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => {
      return (
        d.title.toLowerCase().includes(q) ||
        d.summary.toLowerCase().includes(q) ||
        d.body_stripped.toLowerCase().includes(q)
      );
    });
  }, [docs, query]);

  const bySlug = useMemo(() => {
    const map = new Map<string, KbDoc>();
    (filtered ?? []).forEach((d) => map.set(d.slug, d));
    return map;
  }, [filtered]);

  return (
    <>
      <NavBar />
      <main className="kb-page">
        <section className="kb-hero">
          <h1 className="kb-hero__title">{t('kb.title')}</h1>
          <input
            className="kb-search"
            type="search"
            placeholder={t('kb.search_placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </section>

        {filtered && filtered.length === 0 && (
          <p className="kb-empty">{t('kb.no_results')}</p>
        )}

        <div className="kb-categories">
          {INDEX.categories.map((cat) => {
            const items = cat.slugs
              .map((slug) => bySlug.get(slug))
              .filter((d): d is KbDoc => Boolean(d));
            if (!items.length) return null;
            return (
              <section key={cat.id} className="kb-category">
                <h2 className="kb-category__title">
                  {cat.title[lang] ?? cat.title.en}
                </h2>
                <ul className="kb-list">
                  {items.map((d) => (
                    <li key={d.slug} className="kb-card">
                      <Link to={`/kb/${d.slug}`} className="kb-card__link">
                        <h3 className="kb-card__title">{d.title}</h3>
                        {d.summary && (
                          <p className="kb-card__summary">{d.summary}</p>
                        )}
                        {d.updated && (
                          <p className="kb-card__meta">
                            {t('kb.updated')} · {d.updated}
                          </p>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}

export default KbIndex;
