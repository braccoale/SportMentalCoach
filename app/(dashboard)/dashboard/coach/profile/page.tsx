import { requireRole } from '@/lib/core/auth';
import {
  getAvatarUrl,
  getProviderProfileByUser,
} from '@/lib/core/profiles';
import { getCoachServices } from '@/lib/core/services';
import { getCoachAvailability } from '@/lib/core/availability';
import { computeProfileCompleteness } from '@/lib/core/coach-profile/completeness';
import { computeCoachOnboarding } from '@/lib/core/onboarding';
import { getVerticalConfig, t } from '@/lib/core/config';
import { getActiveSports, getActiveSpecialties } from '@/lib/core/taxonomies';
import { AccountInfoCard } from '@/components/account-info-card';
import { normalizeGender } from '@/lib/core/profiles/gender';
import { PhotoForm } from '../../photo-form';
import { CoachProfileWorkspace } from '../profile-workspace';
import { VideoUpload } from '../video-upload';
import { OnboardingProgress } from '../onboarding-progress';

function StatusBanner({ status }: { status: string }) {
  const config = getVerticalConfig();
  const label = t(`provider.status.${status}`, config);

  const tone =
    status === 'rejected'
      ? 'border-red-200 bg-red-50 text-red-800'
      : status === 'pending'
        ? 'border-gray-300 bg-gray-50 text-gray-800'
        : 'border-gray-200 bg-gray-50 text-gray-700';

  const message =
    status === 'pending'
      ? 'Il tuo profilo è in revisione. Sarà pubblicato dopo l’approvazione dell’admin.'
      : status === 'rejected'
        ? 'Il tuo profilo è stato rifiutato. Aggiorna i dati e invialo di nuovo per la revisione.'
        : 'Il tuo profilo è in bozza e non è ancora visibile. Completa i passi qui sotto e invialo per la revisione.';

  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <p className="text-sm font-semibold">Stato profilo: {label}</p>
      <p className="text-sm">{message}</p>
    </div>
  );
}

export default async function CoachProfilePage() {
  const user = await requireRole('coach');
  const config = getVerticalConfig();

  const [provider, services, avatarUrl, availability] = await Promise.all([
    getProviderProfileByUser(user.id),
    getCoachServices(user.id),
    getAvatarUrl(user.id),
    getCoachAvailability(user.id),
  ]);

  const onboarding = provider
    ? computeCoachOnboarding(
        provider,
        services.filter(
          (service) =>
            service.isActive &&
            Number.isInteger(service.durationMin) &&
            (service.durationMin ?? 0) > 0
        ).length
      )
    : null;

  // Sports/specialties come from the DB master data (active only).
  const [sportOptions, specialtyOptions] = await Promise.all([
    getActiveSports(),
    getActiveSpecialties(),
  ]);
  const levelOptions = (config.taxonomies.levels ?? []).map((i) => ({
    key: i.key,
    label: i.label,
  }));

  if (!provider) {
    return (
      <section className="p-6">
        <p className="text-gray-500">
          Nessun profilo coach trovato per questo account.
        </p>
      </section>
    );
  }

  // Quanto è completo il profilo e cosa manca: stessi dati e stessa regola che
  // l'elenco dei coach usa per l'ordine (lib/core/coach-profile).
  const activeServices = services.filter((service) => service.isActive);
  const completeness = computeProfileCompleteness({
    hasPhoto: !!avatarUrl,
    headline: provider.headline,
    description: provider.description,
    categories: provider.categories,
    specialties: provider.specialties,
    athleteLevels: provider.athleteLevels,
    languages: provider.languages,
    coachSince: provider.coachSince,
    yearsExperience: provider.yearsExperience,
    certifications: provider.certifications,
    hasVideo: !!provider.videoUrl,
    hasService: activeServices.some((s) => (s.durationMin ?? 0) > 0),
    hasPricedService: activeServices.some(
      (s) => (s.durationMin ?? 0) > 0 && (s.price ?? 0) > 0
    ),
    hasAvailability: availability.length > 0,
  });

  return (
    <section className="flex flex-col gap-6 p-6">
      <div className="contents">
        {/* Non-approved states keep the explanatory banner; the "Approved"
            state is shown as a badge inside the photo card instead. */}
        {provider.status !== 'approved' && <StatusBanner status={provider.status} />}
        {onboarding && provider.status !== 'approved' && (
          <OnboardingProgress onboarding={onboarding} />
        )}

        {/* L'ancora che i passi dell'onboarding raggiungono (`#onboarding-profilo`). */}
        <div id="onboarding-profilo">
          <CoachProfileWorkspace
            completeness={completeness}
            // Il profilo demo si legge ma non si modifica: vale per i campi, non per le schede.
            readOnly={user.isDemo}
            values={{
              headline: provider.headline,
              description: provider.description,
              categories: provider.categories ?? [],
              specialties: provider.specialties ?? [],
              athleteLevels: provider.athleteLevels ?? [],
              languages: provider.languages ?? [],
              certifications: provider.certifications ?? [],
              coachSince: provider.coachSince,
              gender: normalizeGender(provider.gender),
            }}
            sportOptions={sportOptions}
            specialtyOptions={specialtyOptions}
            levelOptions={levelOptions}
            photo={
              <PhotoForm
                bare
                name={[user.name, user.lastName].filter(Boolean).join(' ') || null}
                avatarUrl={avatarUrl}
                status={provider.status}
              />
            }
            video={<VideoUpload videoUrl={provider.videoUrl} />}
            account={<AccountInfoCard />}
          />
        </div>
      </div>
    </section>
  );
}
