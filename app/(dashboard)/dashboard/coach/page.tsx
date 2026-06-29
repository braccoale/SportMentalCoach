import Link from 'next/link';
import { requireRole } from '@/lib/core/auth';
import { getCoachBookings, bookingStatusLabel } from '@/lib/core/bookings';
import {
  getAvatarUrl,
  getProviderProfileByUser,
} from '@/lib/core/profiles';
import { getCoachServices } from '@/lib/core/services';
import { getCoachAvailability } from '@/lib/core/availability';
import { computeCoachOnboarding } from '@/lib/core/onboarding';
import { getVerticalConfig, t } from '@/lib/core/config';
import { formatDateTime } from '@/lib/core/format';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import { PhotoForm } from '../photo-form';
import { ProfileEditor } from './profile-editor';
import { ServicesEditor } from './services-editor';
import { AvailabilityEditor } from './availability-editor';
import { OnboardingProgress } from './onboarding-progress';
import { acceptBookingAction, declineBookingAction } from './actions';

function StatusBanner({ status }: { status: string }) {
  const config = getVerticalConfig();
  const label = t(`provider.status.${status}`, config);

  const tone =
    status === 'approved'
      ? 'border-green-200 bg-green-50 text-green-800'
      : status === 'rejected'
        ? 'border-red-200 bg-red-50 text-red-800'
        : status === 'pending'
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-gray-200 bg-gray-50 text-gray-700';

  const message =
    status === 'approved'
      ? 'Il tuo profilo è approvato ed è visibile pubblicamente.'
      : status === 'pending'
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

export default async function CoachDashboardPage() {
  const user = await requireRole('coach');
  const config = getVerticalConfig();

  const [provider, services, allBookings, avatarUrl, availability] =
    await Promise.all([
      getProviderProfileByUser(user.id),
      getCoachServices(user.id),
      getCoachBookings(user.id),
      getAvatarUrl(user.id),
      getCoachAvailability(user.id),
    ]);

  // Derive onboarding from already-loaded data (no extra queries).
  const onboarding = provider
    ? computeCoachOnboarding(provider, services.length)
    : null;

  const pending = allBookings.filter((b) => b.status === 'requested');
  const history = allBookings.filter((b) => b.status !== 'requested');

  const sportOptions = config.taxonomies.categories.map((i) => ({
    key: i.key,
    label: i.label,
  }));
  const specialtyOptions = config.taxonomies.specialties.map((i) => ({
    key: i.key,
    label: i.label,
  }));

  return (
    <section className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Coach dashboard</h1>

      {provider ? (
        <>
          <StatusBanner status={provider.status} />
          {onboarding && provider.status !== 'approved' && (
            <OnboardingProgress onboarding={onboarding} />
          )}
          <PhotoForm name={user.name} avatarUrl={avatarUrl} />
          <div id="onboarding-profilo">
            <ProfileEditor
              headline={provider.headline}
              description={provider.description}
              categories={provider.categories ?? []}
              specialties={provider.specialties ?? []}
              sportOptions={sportOptions}
              specialtyOptions={specialtyOptions}
            />
          </div>
          <div id="onboarding-servizi">
            <ServicesEditor services={services} />
          </div>
          <AvailabilityEditor slots={availability} />
        </>
      ) : (
        <p className="text-gray-500">
          Nessun profilo coach trovato per questo account.
        </p>
      )}

      {/* Booking requests */}
      <div>
        <h2 className="text-lg font-medium text-gray-900">
          Richieste in attesa ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-gray-500">Nessuna richiesta in attesa.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {pending.map((b) => (
              <li
                key={b.id}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {b.clientName || b.clientEmail}
                  </p>
                  <p className="text-sm text-gray-500">
                    {b.serviceTitle ?? 'Richiesta generica'} ·{' '}
                    {formatDateTime(b.requestedAt)}
                  </p>
                  {b.scheduledFor && (
                    <p className="text-sm font-medium text-gray-700">
                      Preferito: {formatDateTime(b.scheduledFor)}
                    </p>
                  )}
                  {b.note && (
                    <p className="mt-1 text-sm text-gray-600">“{b.note}”</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <ActionForm action={acceptBookingAction}>
                    <input type="hidden" name="bookingId" value={b.id} />
                    <Button type="submit" className="rounded-full">
                      Accetta
                    </Button>
                  </ActionForm>
                  <ActionForm action={declineBookingAction}>
                    <input type="hidden" name="bookingId" value={b.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      className="rounded-full"
                    >
                      Rifiuta
                    </Button>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h2 className="mt-8 text-lg font-medium text-gray-900">Storico</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-gray-500">Nessuna richiesta passata.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {history.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 text-sm"
              >
                <span className="text-gray-700">
                  {b.clientName || b.clientEmail} —{' '}
                  {b.serviceTitle ?? 'Richiesta generica'}
                </span>
                <span className="flex items-center gap-3">
                  {b.status === 'accepted' && (
                    <>
                      <Link
                        href={`/dashboard/chat/${b.id}`}
                        className="font-medium text-orange-600 hover:text-orange-700"
                      >
                        Apri chat →
                      </Link>
                      <Link
                        href={`/dashboard/video/${b.id}`}
                        className="font-medium text-orange-600 hover:text-orange-700"
                      >
                        Apri videochiamata →
                      </Link>
                    </>
                  )}
                  <span className="font-medium text-gray-500">
                    {bookingStatusLabel(b.status)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
