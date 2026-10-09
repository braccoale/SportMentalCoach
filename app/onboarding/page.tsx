import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getUserRoles } from '@/lib/core/auth';
import { getOnboardingState } from '@/lib/core/onboarding';
import { getAvatarUrl, getClientProfile, getProviderProfileByUser } from '@/lib/core/profiles';
import { getCoachServices } from '@/lib/core/services';
import { getCoachAvailability } from '@/lib/core/availability';
import { getRateSuggestionForCoach } from '@/lib/core/rate-suggestion/server';
import { COACH_WIZARD_STEPS, clampWizardStep, yearsFromCoachSince } from '@/lib/core/onboarding/coach-wizard';
import { getCoachWizardSummary } from './actions';
import { getActiveSports, getActiveSpecialties } from '@/lib/core/taxonomies';
import { getVerticalConfig } from '@/lib/core/config';
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
    const [provider, sports, specialties, avatarUrl, services, availability, suggestion] = await Promise.all([
      getProviderProfileByUser(user.id),
      getActiveSports(),
      getActiveSpecialties(),
      getAvatarUrl(user.id),
      getCoachServices(user.id),
      getCoachAvailability(user.id),
      // Un guasto qui toglie il consiglio sul prezzo, non il wizard.
      getRateSuggestionForCoach(user.id).catch(() => null),
    ]);
    // Se si riprende dal riepilogo, lo si prepara qui: niente attesa nel browser.
    const initialSummary =
      clampWizardStep(state.step) === COACH_WIZARD_STEPS.length - 1 ? await getCoachWizardSummary() : null;
    return (
      <CoachWizard
        startStep={state.step}
        sports={sports}
        specialties={specialties}
        levels={(getVerticalConfig().taxonomies.levels ?? []).map((l) => ({ key: l.key, label: l.label }))}
        avatarUrl={avatarUrl}
        videoUrl={provider?.videoUrl ?? null}
        rateLevel={suggestion?.level ?? null}
        existingServices={services
          .filter((s) => s.isActive && !s.isIntro && (s.durationMin ?? 0) > 0)
          .map((s) => ({ id: s.id, title: s.title ?? '', durationMin: s.durationMin ?? 0, price: s.price }))}
        availabilityCount={availability.length}
        initialSummary={initialSummary}
        initial={{
          name,
          lastName,
          headline: provider?.headline ?? '',
          description: provider?.description ?? '',
          yearsExperience: yearsFromCoachSince(provider?.coachSince) ?? provider?.yearsExperience ?? null,
          languages: provider?.languages ?? [],
          categories: provider?.categories ?? [],
          specialties: provider?.specialties ?? [],
          athleteLevels: provider?.athleteLevels ?? [],
          certifications: provider?.certifications ?? [],
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
