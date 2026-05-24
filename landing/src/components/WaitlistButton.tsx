import { useT } from '../i18n/LangContext';
import { useRefCode } from '../hooks/useRefCode';

// Bot username is hard-coded for now. Wire to env later.
const BOT_USERNAME = 'AIGoldenConnect_bot';

function buildHref(myCode: string): string {
  // Visitor's own code goes forward as the start param so the bot knows
  // WHO is inviting future users coming through this link.
  const payload = myCode ? `ref_${myCode}` : 'ref_direct';
  return `https://t.me/${BOT_USERNAME}?start=${payload}`;
}

interface Props {
  variant?: 'primary' | 'floating';
  labelKey?: string;
}

export function WaitlistButton({ variant = 'primary', labelKey }: Props) {
  const t = useT();
  const { myCode } = useRefCode();
  const href = buildHref(myCode);

  const defaultKey = variant === 'floating' ? 'hero.floating_cta' : 'hero.cta_primary';
  const label = t(labelKey ?? defaultKey);

  if (variant === 'floating') {
    return (
      <a
        className="waitlist-float"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
      >
        <span className="waitlist-float-dot" aria-hidden="true" />
        {label}
      </a>
    );
  }

  return (
    <a
      className="waitlist-btn"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
    </a>
  );
}
