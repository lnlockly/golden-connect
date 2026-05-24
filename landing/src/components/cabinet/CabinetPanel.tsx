import { OnboardingPanel } from './OnboardingPanel';

/**
 * Cabinet · Панель управления — wraps the OnboardingPanel wizard with a
 * page heading. When onboarding is complete the panel collapses itself;
 * we can add further widgets here later (daily goal, earn tips, etc).
 */
export function CabinetPanel() {
  return (
    <div className="tx-cab-page">
      <header className="tx-cab-page-head">
        <h1 className="tx-cab-page-title">Панель управления</h1>
        <p className="tx-cab-page-sub">
          3 шага, чтобы полностью настроить аккаунт и начать зарабатывать
        </p>
      </header>
      <OnboardingPanel />
    </div>
  );
}
