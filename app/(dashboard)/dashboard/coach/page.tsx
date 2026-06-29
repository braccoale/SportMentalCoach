import { requireRole } from '@/lib/core/auth';
import { getCoachBookings } from '@/lib/core/bookings';
import { getVerticalConfig, t } from '@/lib/core/config';
import { Button } from '@/components/ui/button';
import { acceptBookingAction, declineBookingAction } from './actions';

function statusLabel(status: string): string {
  const config = getVerticalConfig();
  return t(`booking.status.${status}`, config);
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

export default async function CoachDashboardPage() {
  const user = await requireRole('coach');
  const all = await getCoachBookings(user.id);
  const pending = all.filter((b) => b.status === 'requested');
  const history = all.filter((b) => b.status !== 'requested');

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Coach dashboard</h1>

      <h2 className="mt-6 text-lg font-medium text-gray-900">
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
                  {formatDate(b.requestedAt)}
                </p>
                {b.note && (
                  <p className="mt-1 text-sm text-gray-600">“{b.note}”</p>
                )}
              </div>
              <div className="flex gap-2">
                <form action={acceptBookingAction}>
                  <input type="hidden" name="bookingId" value={b.id} />
                  <Button type="submit" className="rounded-full">
                    Accetta
                  </Button>
                </form>
                <form action={declineBookingAction}>
                  <input type="hidden" name="bookingId" value={b.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    className="rounded-full"
                  >
                    Rifiuta
                  </Button>
                </form>
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
              <span className="font-medium text-gray-500">
                {statusLabel(b.status)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
