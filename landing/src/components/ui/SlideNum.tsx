export function SlideNum({ n, total = 17 }: { n: number; total?: number }) {
  const a = String(n).padStart(2, '0');
  const b = String(total).padStart(2, '0');
  return <div className="slide-num">{a} / {b}</div>;
}
