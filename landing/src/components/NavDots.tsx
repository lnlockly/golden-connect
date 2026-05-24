import { useEffect, useRef } from 'react';

const SLIDES = Array.from({ length: 17 }, (_, i) => `s${i + 1}`);

export function NavDots() {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;

    const dots = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a'));
    const sections = SLIDES
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const href = `#${entry.target.id}`;
            dots.forEach((d) => d.classList.toggle('active', d.getAttribute('href') === href));
          }
        });
      },
      { threshold: 0.5 }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    <nav ref={ref} className="nav-dots" aria-label="slide navigation">
      {SLIDES.map((id) => (
        <a key={id} href={`#${id}`} />
      ))}
    </nav>
  );
}
