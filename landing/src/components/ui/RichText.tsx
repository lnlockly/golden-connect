import { createElement } from 'react';
import { useT } from '../../i18n/LangContext';

interface Props {
  k: string;
  as?: string;
  className?: string;
}

/**
 * Renders an i18n key whose value may contain inline HTML
 * (<br>, <span class="hi">, <b>, <strong>). Dictionaries live in-repo
 * and are fully trusted.
 */
export function RichText({ k, as = 'span', className }: Props) {
  const t = useT();
  return createElement(as, {
    className,
    dangerouslySetInnerHTML: { __html: t(k) },
  });
}
