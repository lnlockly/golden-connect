import { RichText } from './RichText';

export function SlideLabel({ k }: { k: string }) {
  return <RichText as="div" className="slide-label" k={k} />;
}
