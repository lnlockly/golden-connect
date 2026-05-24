import { useState } from 'react';
import { useT } from '../../i18n/LangContext';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { RichText } from '../../components/ui/RichText';

const QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];

export function Faq() {
  const t = useT();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="section-faq">
      <div className="section-head">
        <Eyebrow k="tx.faq.eyebrow" />
        <RichText as="h2" className="section-h" k="tx.faq.h" />
      </div>

      <div className="mx-faq-list">
        {QUESTIONS.map((k, i) => {
          const isOpen = open === i;
          return (
            <details
              key={k}
              className={`mx-faq-item${isOpen ? ' open' : ''}`}
              open={isOpen}
              onToggle={(e) => {
                if ((e.target as HTMLDetailsElement).open) setOpen(i);
                else if (isOpen) setOpen(null);
              }}
            >
              <summary>
                <span className="mx-faq-q">{t(`tx.faq.${k}.q`)}</span>
                <span className="mx-faq-caret" aria-hidden="true">+</span>
              </summary>
              <div className="mx-faq-a">{t(`tx.faq.${k}.a`)}</div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
