import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getUserRoles } from '@/lib/core/auth';
import { getOnboardingState } from '@/lib/core/onboarding';
import { getClientProfile, getProviderProfileByUser } from '@/lib/core/profiles';
import { getActiveSports, getActiveSpecialties } from '@/lib/core/taxonomies';
import { AthleteWizard } from './athlete-wizard';
import { CoachWizard } from './coach-wizard';

export const dynamic = 'force-dynamic';

/**
 * Role-aware onboarding entry. Athletes and coaches have a wizard; other roles
 * are marked complete at signup, so they never reach here — if one does (e.g. a
 * manual visit), we send them to their dashboard.
 */
export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const [roles, state] = await Promise.all([
    getUserRoles(user.id),
    getOnboardingState(user.id),
  ]);

  if (!state || state.status === 'completed') redirect('/dashboard');

  const name = user.name ?? '';
  const lastName = user.lastName ?? '';

  if (roles.includes('coach')) {
    const [provider, sports, specialties] = await Promise.all([
      getProviderProfileByUser(user.id),
      getActiveSports(),
      getActiveSpecialties(),
    ]);
    return (
      <CoachWizard
        startStep={state.step}
        sports={sports}
        specialties={specialties}
        initial={{
          name,
          lastName,
          headline: provider?.headline ?? '',
          description: provider?.description ?? '',
          yearsExperience: provider?.yearsExperience ?? null,
          languages: provider?.languages ?? [],
          categories: provider?.categories ?? [],
          specialties: provider?.specialties ?? [],
          athleteLevels: provider?.athleteLevels ?? [],
        }}
      />
    );
  }

  if (roles.includes('athlete')) {
    const [profile, sports] = await Promise.all([
      getClientProfile(user.id),
      getActiveSports(),
    ]);
    return (
      <AthleteWizard
        startStep={state.step}
        sports={sports}
        initial={{
          name,
          lastName,
          birthDate: profile.birthDate,
          city: profile.city ?? '',
          category: profile.category ?? '',
          level: profile.level ?? '',
          goals: profile.goals ? profile.goals.split(',').filter(Boolean) : [],
        }}
      />
    );
  }

  redirect('/dashboard');
}
