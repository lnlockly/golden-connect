import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from './en.json';
import ru from './ru.json';
import zh from './zh.json';
import es from './es.json';
import vi from './vi.json';
import pt from './pt.json';
import uz from './uz.json';
import hi from './hi.json';

export type Lang = 'en' | 'ru' | 'zh' | 'es' | 'vi' | 'pt' | 'uz' | 'hi';

type Dict = Record<string, string>;
const DICTS: Record<Lang, Dict> = {
  en: en as Dict,
  ru: ru as Dict,
  zh: zh as Dict,
  es: es as Dict,
  vi: vi as Dict,
  pt: pt as Dict,
  uz: uz as Dict,
  hi: hi as Dict,
};

const ALL_LANGS: Lang[] = ['en', 'ru', 'zh', 'es', 'vi', 'pt', 'uz', 'hi'];

function isLang(v: string | null | undefined): v is Lang {
  return !!v && (ALL_LANGS as string[]).includes(v);
}

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const Ctx = createContext<LangCtx | null>(null);

function detectInitialLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (isLang(q)) return q;
  } catch {
    /* ignore */
  }
  try {
    const saved = localStorage.getItem('goldenConnect_lang');
    if (isLang(saved)) return saved;
  } catch {
    /* ignore */
  }
  const b = (navigator.language || 'ru').toLowerCase();
  if (b.startsWith('ru')) return 'ru';
  if (b.startsWith('zh')) return 'zh';
  if (b.startsWith('es')) return 'es';
  if (b.startsWith('pt')) return 'pt';
  if (b.startsWith('vi')) return 'vi';
  if (b.startsWith('uz')) return 'uz';
  if (b.startsWith('hi')) return 'hi';
  if (b.startsWith('en')) return 'en';
  // Russian is the primary language of the project — default to RU
  // when we can't detect anything useful.
  return 'ru';
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectInitialLang());

  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem('goldenConnect_lang', lang); } catch { /* ignore */ }
  }, [lang]);

  const value = useMemo<LangCtx>(() => ({
    lang,
    setLang: setLangState,
    // Fallback: current lang → RU (primary master) → EN → raw key.
    t: (key: string) =>
      DICTS[lang][key] ?? DICTS.ru[key] ?? DICTS.en[key] ?? key,
  }), [lang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLang must be used inside LangProvider');
  return ctx;
}

export function useT() {
  return useLang().t;
}
