import type { ProviderProfile } from '@/lib/db/schema';

export type OnboardingStep = {
  key: 'profile' | 'photo' | 'taxonomies' | 'services' | 'submit';
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
  /** Steps before «submit» done AND status is draft/rejected (eligible to submit). */
  canSubmit: boolean;
  /** Status is no longer draft (it has been submitted at least once). */
  isSubmitted: boolean;
};

export type CoachOnboardingProfile = Pick<
  ProviderProfile,
  'headline' | 'description' | 'categories' | 'specialties' | 'status'
>;

/**
 * Pure onboarding computation from already-loaded data. Use this when the
 * caller already has the provider row and service count (e.g. the coach
 * dashboard) to avoid re-querying.
 */
export function computeCoachOnboarding(
  provider: CoachOnboardingProfile,
  serviceCount: number,
  /** Ha una foto del profilo: serve per inviare il profilo in revisione. */
  hasPhoto: boolean
): CoachOnboarding {
  const profileDone =
    !!provider.headline?.trim() && !!provider.description?.trim();
  const photoDone = hasPhoto;
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
      anchor: '#onboarding-profilo',
      done: profileDone,
    },
    {
      key: 'photo',
      label: 'Foto del profilo',
      description: 'Carica una foto del tuo volto, ben illuminata e riconoscibile.',
      anchor: '#foto-profilo',
      done: photoDone,
    },
    {
      key: 'taxonomies',
      label: 'Sport e specializzazioni',
      description: 'Seleziona almeno uno sport e una specializzazione.',
      anchor: '#onboarding-profilo',
      done: taxonomiesDone,
    },
    {
      key: 'services',
      label: 'Servizi',
      description: 'Crea almeno un servizio attivo con titolo e durata.',
      anchor: '/dashboard/coach/services',
      done: servicesDone,
    },
    {
      key: 'submit',
      label: 'Invia per la revisione',
      description: 'Invia il profilo all’admin per l’approvazione.',
      done: submitDone,
    },
  ];

  const contentDone = profileDone && photoDone && taxonomiesDone && servicesDone;
  const canSubmit =
    contentDone &&
    (provider.status === 'draft' || provider.status === 'rejected');

  const nextStep =
    steps.find((s) => s.key !== 'submit' && !s.done) ??
    (canSubmit ? steps.find((s) => s.key === 'submit') ?? null : null);

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
