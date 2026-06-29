import 'server-only';
import { count, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { providerProfiles, services } from '@/lib/db/schema';

export type OnboardingStep = {
  key: 'profile' | 'taxonomies' | 'services' | 'submit';
  label: string;
  description: string;
  anchor?: string; // in-page id of the related editor section
  done: boolean;
};

export type CoachOnboarding = {
  status: string;
  steps: OnboardingStep[];
  completedCount: number;
  totalSteps: number;
  /** First incomplete content step (1–3), or the submit step, or null. */
  nextStep: OnboardingStep | null;
  /** Steps 1–3 done AND status is draft/rejected (eligible to submit). */
  canSubmit: boolean;
  /** Status is no longer draft (it has been submitted at least once). */
  isSubmitted: boolean;
};

/**
 * Derives the coach's onboarding progress from existing data — no extra
 * columns. Step completion:
 *  1. profile     → headline + description present
 *  2. taxonomies  → at least one sport and one specialty
 *  3. services    → at least one service
 *  4. submit      → status is no longer `draft` (submitted for review)
 */
export async function getCoachOnboarding(
  userId: number
): Promise<CoachOnboarding | null> {
  const [provider] = await db
    .select()
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, userId))
    .limit(1);
  if (!provider) return null;

  const [{ value: serviceCount }] = await db
    .select({ value: count() })
    .from(services)
    .where(eq(services.providerId, provider.id));

  const profileDone =
    !!provider.headline?.trim() && !!provider.description?.trim();
  const taxonomiesDone =
    (provider.categories?.length ?? 0) > 0 &&
    (provider.specialties?.length ?? 0) > 0;
  const servicesDone = serviceCount > 0;
  const submitDone = provider.status !== 'draft';

  const steps: OnboardingStep[] = [
    {
      key: 'profile',
      label: 'Profilo base',
      description: 'Aggiungi un titolo (headline) e una bio.',
      anchor: 'onboarding-profilo',
      done: profileDone,
    },
    {
      key: 'taxonomies',
      label: 'Sport e specializzazioni',
      description: 'Seleziona almeno uno sport e una specializzazione.',
      anchor: 'onboarding-profilo',
      done: taxonomiesDone,
    },
    {
      key: 'services',
      label: 'Servizi',
      description: 'Crea almeno un servizio (titolo, durata, prezzo).',
      anchor: 'onboarding-servizi',
      done: servicesDone,
    },
    {
      key: 'submit',
      label: 'Invia per la revisione',
      description: 'Invia il profilo all’admin per l’approvazione.',
      done: submitDone,
    },
  ];

  const contentDone = profileDone && taxonomiesDone && servicesDone;
  const canSubmit =
    contentDone &&
    (provider.status === 'draft' || provider.status === 'rejected');

  const nextStep =
    steps.find((s) => s.key !== 'submit' && !s.done) ??
    (canSubmit ? steps[3] : null);

  return {
    status: provider.status,
    steps,
    completedCount: steps.filter((s) => s.done).length,
    totalSteps: steps.length,
    nextStep,
    canSubmit,
    isSubmitted: submitDone,
  };
}
