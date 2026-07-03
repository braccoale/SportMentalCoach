import { requireRole } from '@/lib/core/auth';
import {
  getAvatarUrl,
  getProviderProfileByUser,
} from '@/lib/core/profiles';
import { getCoachServices } from '@/lib/core/services';
import { computeCoachOnboarding } from '@/lib/core/onboarding';
import { getVerticalConfig, t } from '@/lib/core/config';
import { getActiveSports, getActiveSpecialties } from '@/lib/core/taxonomies';
import { AccountInfoCard } from '@/components/account-info-card';
import { PhotoForm } from '../../photo-form';
import { ProfileEditor } from '../profile-editor';
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

  const [provider, services, avatarUrl] = await Promise.all([
    getProviderProfileByUser(user.id),
    getCoachServices(user.id),
    getAvatarUrl(user.id),
  ]);

  const onboarding = provider
    ? computeCoachOnboarding(provider, services.length)
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

  return (
    <section className="flex flex-col gap-6 p-6">
      {/* Non-approved states keep the explanatory banner; the "Approved"
          state is shown as a badge inside the photo card instead. */}
      {provider.status !== 'approved' && <StatusBanner status={provider.status} />}
      {onboarding && provider.status !== 'approved' && (
        <OnboardingProgress onboarding={onboarding} />
      )}

      {/* Photo (with approval badge) + account information, side by side. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PhotoForm name={[user.name, user.lastName].filter(Boolean).join(' ') || null} avatarUrl={avatarUrl} status={provider.status} />
        <AccountInfoCard />
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <VideoUpload videoUrl={provider.videoUrl} />
      </div>

      <div id="onboarding-profilo">
        <ProfileEditor
          headline={provider.headline}
        description={provider.description}
        categories={provider.categories ?? []}
        specialties={provider.specialties ?? []}
        sportOptions={sportOptions}
        specialtyOptions={specialtyOptions}
        coachSince={provider.coachSince}
        languages={provider.languages ?? []}
        certifications={provider.certifications ?? []}
        athleteLevels={provider.athleteLevels ?? []}
        levelOptions={levelOptions}
        />
      </div>
    </section>
  );
}
