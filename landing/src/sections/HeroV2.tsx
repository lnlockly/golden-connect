const WAVE_BARS = 80;

export function HeroV2() {
  return (
    <section id="top" className="hero-v2">
      <div className="hero-wave" aria-hidden="true">
        <div className="hero-wave-bars">
          {Array.from({ length: WAVE_BARS }).map((_, i) => (
            <span
              key={i}
              className="hero-wave-bar"
              style={{ animationDelay: `${(i % 13) * 70}ms` }}
            />
          ))}
        </div>
        <div className="hero-wave-fade" />
      </div>

      <h1 className="hero-brand" aria-label="GOLDEN_CONNECT">GOLDEN_CONNECT</h1>
    </section>
  );
}
