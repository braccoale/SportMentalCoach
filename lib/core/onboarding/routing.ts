/**
 * Pure onboarding routing decision — no DB, no `server-only`, so it can be
 * unit-tested and reused anywhere. Returns the path the user must be sent to,
 * or null when they may continue to their dashboard.
 *
 * Fail-open: a missing state (legacy user) is treated as complete, so existing
 * accounts are never trapped in the wizard.
 */
export function onboardingRedirectFor(
  state: { status: string } | null | undefined
): string | null {
  if (!state) return null;
  if (state.status === 'completed') return null;
  // in_progress / not_started / guardian_pending → into the wizard, which
  // resumes from the saved step.
  return '/onboarding';
}
