import { useT } from '../../i18n/LangContext';
import type { AuthUser } from '../../lib/auth';

/**
 * Three-step onboarding for TrendeX:
 *  1. Выбрать тариф
 *  2. Оплатить вход
 *  3. Сделать первое задание
 *
 * Backend flags for tariff/payment/first-task aren't wired yet, so the
 * "done" state is stubbed locally. Reuses existing .af-activate-*
 * styles so the visual shape matches the rest of the dashboard.
 */

// Mock progress until backend catches up.
const MOCK_TARIFF_PICKED = true;
const MOCK_ENTRY_PAID = false;
const MOCK_FIRST_TASK_DONE = false;

export function ActivationSteps({ user: _user }: { user: AuthUser }) {
  const t = useT();

  const steps: Array<{ key: string; label: string; hint: string; done: boolean }> = [
    {
      key: 'tariff',
      label: t('activation.step_tariff'),
      hint: t('activation.step_tariff_hint'),
      done: MOCK_TARIFF_PICKED,
    },
    {
      key: 'entry',
      label: t('activation.step_entry'),
      hint: t('activation.step_entry_hint'),
      done: MOCK_ENTRY_PAID,
    },
    {
      key: 'first_task',
      label: t('activation.step_first_task'),
      hint: t('activation.step_first_task_hint'),
      done: MOCK_FIRST_TASK_DONE,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const fullyActive = doneCount === steps.length;

  return (
    <section className={`af-activate${fullyActive ? ' is-active' : ''}`}>
      <div className="af-activate-head">
        <div>
          <h3 className="af-activate-title">
            {fullyActive ? t('activation.active_title') : t('activation.title')}
          </h3>
          <p className="af-activate-sub">
            {fullyActive
              ? t('activation.active_sub')
              : `${doneCount}/${steps.length} · ${t('activation.sub')}`}
          </p>
        </div>
        <div className={`af-activate-badge${fullyActive ? ' on' : ''}`}>
          {fullyActive ? t('activation.active_badge') : t('activation.inactive_badge')}
        </div>
      </div>
      <ol className="af-activate-steps">
        {steps.map((s, i) => {
          const isNext = !s.done && steps.slice(0, i).every((x) => x.done);
          return (
            <li
              key={s.key}
              className={
                'af-activate-step' +
                (s.done ? ' done' : '') +
                (isNext ? ' next' : '')
              }
            >
              <span className="af-activate-dot">
                {s.done ? '✓' : i + 1}
              </span>
              <div className="af-activate-body">
                <strong>{s.label}</strong>
                <span>{s.hint}</span>
              </div>
              {i < steps.length - 1 && <span className="af-activate-conn" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
