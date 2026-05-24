import { useT } from '../i18n/LangContext';

export function Footer() {
  const t = useT();
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>{t('footer.l')}</div>
        <div>{t('footer.r')}</div>
      </div>
    </footer>
  );
}
