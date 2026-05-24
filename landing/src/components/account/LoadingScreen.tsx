/**
 * Reuses the exact splash visual from index.html (#af-splash) — 40 vertical
 * wave bars + "TRENDEX" monospace label. Kept structurally identical so
 * it feels like the same loading screen visitors already know from home.
 */
export function LoadingScreen() {
  return (
    <div id="af-splash" role="status" aria-label="Loading TrendeX">
      <div className="af-splash-wave" aria-hidden="true">
        {Array.from({ length: 40 }).map((_, i) => (
          <span key={i} />
        ))}
      </div>
      <div className="af-splash-label">TRENDEX</div>
    </div>
  );
}
