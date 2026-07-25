import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getUserRoles } from '@/lib/core/auth';
import { getOnboardingState } from '@/lib/core/onboarding';
import { getClientProfile } from '@/lib/core/profiles';
import { getActiveSports } from '@/lib/core/taxonomies';
import { AthleteWizard } from './athlete-wizard';

export const dynamic = 'force-dynamic';

/**
 * Role-aware onboarding entry. Only the athlete wizard exists for now; other
 * roles are marked complete at signup, so they never reach here — if one does
 * (e.g. a manual visit), we send them to their dashboard.
 */
export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const [roles, state] = await Promise.all([
    getUserRoles(user.id),
    getOnboardingState(user.id),
  ]);

  // Already done → out of the wizard.
  if (!state || state.status === 'completed') {
    redirect('/dashboard');
  }

  // Non-athletes have no wizard yet.
  if (!roles.includes('athlete')) {
    redirect('/dashboard');
  }

  const [profile, sports] = await Promise.all([
    getClientProfile(user.id),
    getActiveSports(),
  ]);

  return (
    <AthleteWizard
      startStep={state.step}
      sports={sports}
      initial={{
        name: user.name ?? '',
        lastName: user.lastName ?? '',
        birthDate: profile.birthDate,
        city: profile.city ?? '',
        category: profile.category ?? '',
        level: profile.level ?? '',
        goals: profile.goals ? profile.goals.split(',').filter(Boolean) : [],
      }}
    />
  );
}
