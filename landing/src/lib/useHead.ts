/**
 * useHead — tiny, dependency-free per-route SEO head manager for an SPA.
 *
 * Mutates `document.head` directly to set title/meta/link tags and
 * idempotently reconciles them across route changes. Intended to be
 * called once per page component with a stable descriptor.
 *
 * Keeps hreflang alternates consistent with the query-string-based
 * language switcher (`?lang=ru|en|zh`). The LangContext prefers the
 * saved / browser-detected language, so URLs without `?lang=` are also
 * valid canonical endpoints — we emit `x-default` canonically on the
 * path without a lang param.
 */

import { useEffect } from 'react';
import type { Lang } from '../i18n/LangContext';

export type SeoHead = {
  /** <title> — keyword-rich, <=60 chars, unique per route. */
  title: string;
  /** <meta name="description"> — <=160 chars, unique, CTA-flavored. */
  description: string;
  /** Route path, e.g. "/how". Used for canonical + alternates. */
  path: string;
  /** Current active language — drives og:locale and html[lang]. */
  lang: Lang;
  /** Absolute OG image URL. Defaults to /og.png. */
  image?: string;
  /** OG type. Defaults to "website". */
  ogType?: string;
  /** JSON-LD objects to append as <script type="application/ld+json">. */
  jsonLd?: object[];
};

const SITE_ORIGIN = 'https://golden-connect.website';
const DEFAULT_OG = `${SITE_ORIGIN}/og.png`;

const LANG_TO_OG_LOCALE: Record<Lang, string> = {
  en: 'en_US',
  ru: 'ru_RU',
  zh: 'zh_CN',
  es: 'es_ES',
  vi: 'vi_VN',
  pt: 'pt_BR',
  uz: 'uz_UZ',
  hi: 'hi_IN',
};

const LANG_TO_HREFLANG: Record<Lang, string> = {
  en: 'en',
  ru: 'ru',
  zh: 'zh-CN',
  es: 'es',
  vi: 'vi',
  pt: 'pt',
  uz: 'uz',
  hi: 'hi',
};

const MANAGED_ATTR = 'data-seo-managed';

/** Upsert a <meta> tag by name or property. */
function upsertMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    el.setAttribute(MANAGED_ATTR, '1');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** Remove managed tags of a given selector family to keep head clean between routes. */
function clearManaged(selector: string) {
  document.head
    .querySelectorAll(`${selector}[${MANAGED_ATTR}="1"]`)
    .forEach((el) => el.remove());
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    el.setAttribute(MANAGED_ATTR, '1');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setAlternates(path: string) {
  clearManaged('link[rel="alternate"]');
  const langs: Lang[] = ['en', 'ru', 'zh', 'es', 'vi', 'pt', 'uz', 'hi'];
  for (const l of langs) {
    const link = document.createElement('link');
    link.setAttribute('rel', 'alternate');
    link.setAttribute('hreflang', LANG_TO_HREFLANG[l]);
    link.setAttribute('href', `${SITE_ORIGIN}${path}?lang=${l}`);
    link.setAttribute(MANAGED_ATTR, '1');
    document.head.appendChild(link);
  }
  const xdef = document.createElement('link');
  xdef.setAttribute('rel', 'alternate');
  xdef.setAttribute('hreflang', 'x-default');
  xdef.setAttribute('href', `${SITE_ORIGIN}${path}`);
  xdef.setAttribute(MANAGED_ATTR, '1');
  document.head.appendChild(xdef);
}

function setJsonLd(scripts: object[] | undefined) {
  clearManaged('script[type="application/ld+json"]');
  if (!scripts || !scripts.length) return;
  for (const obj of scripts) {
    const s = document.createElement('script');
    s.setAttribute('type', 'application/ld+json');
    s.setAttribute(MANAGED_ATTR, '1');
    s.textContent = JSON.stringify(obj);
    document.head.appendChild(s);
  }
}

export function useHead(head: SeoHead): void {
  const { title, description, path, lang, image, ogType = 'website', jsonLd } = head;

  useEffect(() => {
    const canonical = `${SITE_ORIGIN}${path}`;
    const og = image || DEFAULT_OG;

    // <title> + html lang
    document.title = title;
    document.documentElement.lang = LANG_TO_HREFLANG[lang];

    // Primary meta
    upsertMeta('meta[name="description"]', 'name', 'description', description);

    // Canonical + hreflang alternates
    setCanonical(canonical);
    setAlternates(path);

    // OpenGraph
    upsertMeta('meta[property="og:type"]',         'property', 'og:type',        ogType);
    upsertMeta('meta[property="og:site_name"]',    'property', 'og:site_name',   'Golden Connect');
    upsertMeta('meta[property="og:title"]',        'property', 'og:title',       title);
    upsertMeta('meta[property="og:description"]',  'property', 'og:description', description);
    upsertMeta('meta[property="og:url"]',          'property', 'og:url',         canonical);
    upsertMeta('meta[property="og:image"]',        'property', 'og:image',       og);
    upsertMeta('meta[property="og:image:width"]',  'property', 'og:image:width', '1200');
    upsertMeta('meta[property="og:image:height"]', 'property', 'og:image:height', '630');
    upsertMeta('meta[property="og:locale"]',       'property', 'og:locale',      LANG_TO_OG_LOCALE[lang]);

    // og:locale:alternate — drop and re-add to reflect current language set
    clearManaged('meta[property="og:locale:alternate"]');
    (['en', 'ru', 'zh', 'es', 'vi', 'pt', 'uz', 'hi'] as Lang[])
      .filter((l) => l !== lang)
      .forEach((l) => {
        const el = document.createElement('meta');
        el.setAttribute('property', 'og:locale:alternate');
        el.setAttribute('content', LANG_TO_OG_LOCALE[l]);
        el.setAttribute(MANAGED_ATTR, '1');
        document.head.appendChild(el);
      });

    // Twitter
    upsertMeta('meta[name="twitter:card"]',        'name', 'twitter:card',        'summary_large_image');
    upsertMeta('meta[name="twitter:title"]',       'name', 'twitter:title',       title);
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    upsertMeta('meta[name="twitter:image"]',       'name', 'twitter:image',       og);

    // Theme + robots
    upsertMeta('meta[name="theme-color"]', 'name', 'theme-color', '#0a0a0a');
    upsertMeta(
      'meta[name="robots"]',
      'name',
      'robots',
      'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
    );

    // JSON-LD
    setJsonLd(jsonLd);
  }, [title, description, path, lang, image, ogType, jsonLd]);
}

/** Organization JSON-LD — stable across routes. */
export const ORG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Golden Connect',
  url: SITE_ORIGIN,
  logo: `${SITE_ORIGIN}/favicon.svg`,
  foundingDate: '2026',
  sameAs: [
    'https://t.me/golden-connect',
    'https://x.com/golden-connect',
    'https://github.com/lnlockly/golden-connect-landing',
  ],
};

/** WebSite JSON-LD with SearchAction. */
export const WEBSITE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Golden Connect',
  url: SITE_ORIGIN,
  potentialAction: {
    '@type': 'SearchAction',
    target: `${SITE_ORIGIN}/?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
};

/** SoftwareApplication JSON-LD — marketplace platform. */
export const SOFTWARE_APP_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Golden Connect',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: SITE_ORIGIN,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  aggregateRating: undefined,
};

export { SITE_ORIGIN };
