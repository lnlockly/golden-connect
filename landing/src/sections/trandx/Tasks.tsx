import { useT } from '../../i18n/LangContext';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { RichText } from '../../components/ui/RichText';

const TOOLS = ['landings', 'ai', 'shortener', 'bio', 'video', 'modules'];

export function Tasks() {
  const t = useT();
  return (
    <section id="tools" className="section-tasks section-tools">
      <div className="section-head">
        <Eyebrow k="tx.tools.eyebrow" />
        <RichText as="h2" className="section-h" k="tx.tools.h" />
        <p className="section-lede">{t('tx.tools.lede')}</p>
      </div>

      <div className="mx-tasks-grid">
        {TOOLS.map((k, i) => (
          <article key={k} className="mx-task-card">
            <div className="mx-task-n">{String(i + 1).padStart(2, '0')}</div>
            <h3>{t(`tx.tools.${k}.h`)}</h3>
            <p>{t(`tx.tools.${k}.p`)}</p>
            <div className="mx-task-pay">{t(`tx.tools.${k}.tag`)}</div>
          </article>
        ))}
      </div>

      <p className="mx-tariffs-foot tools-footer">{t('tx.tools.foot')}</p>
    </section>
  );
}
