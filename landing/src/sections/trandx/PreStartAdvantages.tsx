import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../i18n/LangContext';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { RichText } from '../../components/ui/RichText';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function diffParts(ms: number) {
  if (ms <= 0) return { days: '00', hours: '00', minutes: '00', seconds: '00' };
  return {
    days:    pad(Math.floor(ms / 86_400_000)),
    hours:   pad(Math.floor((ms % 86_400_000) / 3_600_000)),
    minutes: pad(Math.floor((ms % 3_600_000) / 60_000)),
    seconds: pad(Math.floor((ms % 60_000) / 1000)),
  };
}

export function PreStartAdvantages() {
  const t = useT();
  const target = useMemo(() => Date.now() + 14 * 86_400_000, []);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { days, hours, minutes, seconds } = diffParts(target - now);

  return (
    <section id="launch" className="section-prestart section-launch">
      <div className="section-head">
        <Eyebrow k="tx.launch.eyebrow" />
        <RichText as="h2" className="section-h" k="tx.launch.h" />
        <p className="section-lede">{t('tx.launch.lede')}</p>
      </div>

      <div className="mx-pre-grid timer-box">
        <div className="mx-pre-status">
          <div className="mx-pre-status-dot timer-badge-dot" aria-hidden="true" />
          <div className="mx-pre-status-body">
            <div className="mx-pre-status-eyebrow timer-badge">{t('tx.launch.timer_badge')}</div>
            <div className="mx-pre-status-v timer-title">{t('tx.launch.timer_title')}</div>
            <div className="mx-pre-status-sub timer-sub">{t('tx.launch.timer_sub')}</div>
          </div>
        </div>

        <div className="mx-pre-advantages timer-counter">
          <div className="mx-pre-adv counter-box">
            <span className="mx-pre-adv-n counter-num">{days}</span>
            <div className="mx-pre-adv-body counter-label">{t('tx.launch.label_days')}</div>
          </div>
          <div className="mx-pre-adv counter-box">
            <span className="mx-pre-adv-n counter-num">{hours}</span>
            <div className="mx-pre-adv-body counter-label">{t('tx.launch.label_hours')}</div>
          </div>
          <div className="mx-pre-adv counter-box">
            <span className="mx-pre-adv-n counter-num">{minutes}</span>
            <div className="mx-pre-adv-body counter-label">{t('tx.launch.label_minutes')}</div>
          </div>
          <div className="mx-pre-adv counter-box">
            <span className="mx-pre-adv-n counter-num">{seconds}</span>
            <div className="mx-pre-adv-body counter-label">{t('tx.launch.label_seconds')}</div>
          </div>
        </div>

        <Link to="/signup" className="btn-primary">
          {t('tx.launch.cta')}
          <span className="btn-caret">→</span>
        </Link>
      </div>
    </section>
  );
}
