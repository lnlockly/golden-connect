import { RichText } from './RichText';

export function Eyebrow({ k }: { k: string }) {
  return <RichText as="div" className="eyebrow" k={k} />;
}
