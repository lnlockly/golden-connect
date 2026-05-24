import { useLang, type Lang } from '../i18n/LangContext';

const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'zh', label: '中文' },
];

export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-switch" role="group" aria-label="language switcher">
      {LANGS.map((l) => (
        <button
          key={l.code}
          data-lang={l.code}
          className={lang === l.code ? 'active' : undefined}
          onClick={() => setLang(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
