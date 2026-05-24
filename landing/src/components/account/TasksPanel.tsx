import { useT } from '../../i18n/LangContext';
import './TasksPanel.css';

/**
 * TasksPanel — "букс" tasks (ad-view / subscribe / quiz / story).
 * Replaces the old quest panel. All state is mocked locally until the
 * tasks backend ships.
 */

type TaskStatus =
  | { kind: 'progress'; done: number; total: number; cta: string }
  | { kind: 'toggle'; active: boolean; ctaOn: string; ctaOff: string }
  | { kind: 'single'; cta: string };

interface MockTask {
  id: string;
  titleKey: string;
  subKey: string;
  payoutKey: string; // shows payout range
  status: TaskStatus;
  badge?: string;
}

// Mock tasks — hard-coded for now.
const MOCK_TASKS: MockTask[] = [
  {
    id: 'ad_view',
    titleKey: 'dash.task_ad_title',
    subKey: 'dash.task_ad_sub',
    payoutKey: 'dash.task_ad_payout',
    status: { kind: 'progress', done: 0, total: 10, cta: 'dash.task_watch_cta' },
  },
  {
    id: 'tg_sub',
    titleKey: 'dash.task_tg_title',
    subKey: 'dash.task_tg_sub',
    payoutKey: 'dash.task_tg_payout',
    status: { kind: 'toggle', active: false, ctaOn: 'dash.task_subscribed', ctaOff: 'dash.task_subscribe_cta' },
    badge: 'dash.task_one_time',
  },
  {
    id: 'quiz',
    titleKey: 'dash.task_quiz_title',
    subKey: 'dash.task_quiz_sub',
    payoutKey: 'dash.task_quiz_payout',
    status: { kind: 'single', cta: 'dash.task_do_cta' },
    badge: 'dash.task_one_time',
  },
  {
    id: 'story',
    titleKey: 'dash.task_story_title',
    subKey: 'dash.task_story_sub',
    payoutKey: 'dash.task_story_payout',
    status: { kind: 'progress', done: 1, total: 3, cta: 'dash.task_upload_cta' },
  },
];

export function TasksPanel() {
  const t = useT();

  return (
    <div className="af-acc-cell af-tasks">
      <div className="af-acc-section-head">
        <h2 className="af-acc-section-title">{t('dash.tasks_title')}</h2>
        <span className="af-acc-section-sub">{t('dash.tasks_sub')}</span>
      </div>

      <div className="af-tasks-list">
        {MOCK_TASKS.map((task) => (
          <TaskRow key={task.id} task={task} t={t} />
        ))}
      </div>

      <p className="af-tasks-foot">{t('dash.tasks_foot')}</p>
    </div>
  );
}

function TaskRow({ task, t }: { task: MockTask; t: (k: string) => string }) {
  const { status } = task;

  return (
    <div className="af-task">
      <div className="af-task-head">
        <div className="af-task-title">{t(task.titleKey)}</div>
        {task.badge && (
          <span className="af-task-badge">{t(task.badge)}</span>
        )}
      </div>
      <div className="af-task-sub">{t(task.subKey)}</div>
      <div className="af-task-payout">{t(task.payoutKey)}</div>

      {status.kind === 'progress' && (
        <div className="af-task-progress">
          <div className="af-task-progress-label">
            <span>
              {status.done}/{status.total}{' '}
              <em>{t('dash.task_today')}</em>
            </span>
          </div>
          <div className="af-task-bar">
            <div
              className="af-task-bar-fill"
              style={{
                width:
                  Math.min(100, Math.round((status.done / status.total) * 100)) +
                  '%',
              }}
            />
          </div>
        </div>
      )}

      {status.kind === 'toggle' && (
        <div className="af-task-toggle-line">
          <span
            className={
              'af-task-status-dot ' + (status.active ? 'on' : 'off')
            }
            aria-hidden
          />
          <span className="af-task-status-label">
            {status.active
              ? t('dash.task_sub_done')
              : t('dash.task_sub_pending')}
          </span>
        </div>
      )}

      <button type="button" className="af-task-cta" disabled>
        {taskCta(status, t)}
      </button>
    </div>
  );
}

function taskCta(status: TaskStatus, t: (k: string) => string): string {
  if (status.kind === 'progress') return t(status.cta);
  if (status.kind === 'toggle') return t(status.active ? status.ctaOn : status.ctaOff);
  return t(status.cta);
}
