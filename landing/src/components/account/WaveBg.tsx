const BARS = 96;

/**
 * Wave backdrop, reuses the hero's `.hero-wave*` classes so the animation
 * curves match the landing. Pure decoration — `aria-hidden`.
 *
 * Usage: wrap-positioned relative, drop `<WaveBg />` absolutely behind content.
 */
export function WaveBg({ className = '' }: { className?: string }) {
  return (
    <div className={`hero-wave ${className}`} aria-hidden="true">
      <div className="hero-wave-bars">
        {Array.from({ length: BARS }).map((_, i) => (
          <span
            key={i}
            className="hero-wave-bar"
            style={{ animationDelay: `${(i % 13) * 70}ms` }}
          />
        ))}
      </div>
      <div className="hero-wave-fade" />
    </div>
  );
}
