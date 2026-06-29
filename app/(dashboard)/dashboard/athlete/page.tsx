import Link from 'next/link';
import { requireRole } from '@/lib/core/auth';
import { getAthleteBookings } from '@/lib/core/bookings';
import { getVerticalConfig, t } from '@/lib/core/config';

function statusLabel(status: string): string {
  const config = getVerticalConfig();
  return t(`booking.status.${status}`, config);
}

function statusClass(status: string): string {
  switch (status) {
    case 'accepted':
      return 'bg-green-50 text-green-700';
    case 'declined':
    case 'cancelled':
      return 'bg-red-50 text-red-700';
    case 'completed':
      return 'bg-blue-50 text-blue-700';
    default:
      return 'bg-amber-50 text-amber-700';
  }
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

export default async function AthleteDashboardPage() {
  const user = await requireRole('athlete');
  const requests = await getAthleteBookings(user.id);

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Athlete dashboard</h1>

      <div className="mt-4 flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">
          Le tue richieste ({requests.length})
        </h2>
        <Link
          href="/coaches"
          className="text-sm font-medium text-orange-600 hover:text-orange-700"
        >
          Trova un coach →
        </Link>
      </div>

      {requests.length === 0 ? (
        <p className="mt-3 text-gray-500">
          Non hai ancora inviato richieste. Sfoglia i coach e richiedi una
          sessione.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {requests.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
            >
              <div>
                <p className="font-medium text-gray-900">
                  {b.coachSlug ? (
                    <Link
                      href={`/coaches/${b.coachSlug}`}
                      className="hover:underline"
                    >
                      {b.coachName ?? 'Coach'}
                    </Link>
                  ) : (
                    (b.coachName ?? 'Coach')
                  )}
                </p>
                <p className="text-sm text-gray-500">
                  {b.serviceTitle ?? 'Richiesta generica'} ·{' '}
                  {formatDate(b.requestedAt)}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass(
                  b.status
                )}`}
              >
                {statusLabel(b.status)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
