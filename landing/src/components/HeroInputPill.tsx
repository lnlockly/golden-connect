import { useRef, type FormEvent } from 'react';
import { useT } from '../i18n/LangContext';

/**
 * The minimal grey input pill that sits at the bottom of the collapsed
 * hero. Its only job is to notice that the visitor has expressed
 * intent — either by focusing the field or by typing the first
 * character — and to hand control to the parent <HeroArea>, which
 * will mount the full chat.
 *
 * We deliberately do NOT owns the pending text — the parent keeps it
 * so it can survive the collapse/expand dance.
 */
interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Fired when the visitor focuses the pill, types the first char,
      or presses the arrow / Enter. */
  onExpand: () => void;
}

export function HeroInputPill({ value, onChange, onExpand }: Props) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const firedRef = useRef(false);

  const expandOnce = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onExpand();
  };

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    onChange(next);
    // First actual character typed → expand. Ignore empty string so a
    // paste-and-clear doesn't loop.
    if (next.length > 0) expandOnce();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    expandOnce();
  }

  return (
    <form
      className="hero-input-pill"
      onSubmit={handleSubmit}
      role="search"
    >
      <input
        ref={inputRef}
        type="text"
        className="hero-input-pill-field"
        placeholder={t('hero_input.placeholder')}
        aria-label={t('hero_input.aria_label')}
        value={value}
        onChange={handleChange}
        onFocus={expandOnce}
        autoComplete="off"
      />
      <button
        type="submit"
        className="hero-input-pill-btn"
        aria-label={t('hero_input.submit_aria')}
      >
        →
      </button>
    </form>
  );
}
