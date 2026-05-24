/**
 * Reusable "coming soon" shell for cabinet sub-pages that aren't
 * implemented yet — Рефералы / Мои места / Доход. Keeps the menu
 * consistent while the backing API + UI lands in PR 3b/3c.
 */
export function CabinetPlaceholder({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="tx-cab-page">
      <header className="tx-cab-page-head">
        <h1 className="tx-cab-page-title">{title}</h1>
        {subtitle ? <p className="tx-cab-page-sub">{subtitle}</p> : null}
      </header>
      <div className="tx-cab-soon">
        <div className="tx-cab-soon-emoji">🛠️</div>
        <div className="tx-cab-soon-text">
          Раздел готовится. Мы наполним его данными и виджетами в ближайших
          обновлениях. Следи за новостями в Telegram-канале.
        </div>
      </div>
    </div>
  );
}
