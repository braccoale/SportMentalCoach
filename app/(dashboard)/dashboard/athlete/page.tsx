import Link from 'next/link';
import { requireRole } from '@/lib/core/auth';
import {
  getAthleteBookings,
  bookingStatusLabel,
  bookingStatusTone,
  type AthleteBooking,
} from '@/lib/core/bookings';
import { getAvatarUrl } from '@/lib/core/profiles';
import { formatDateTime } from '@/lib/core/format';
import { Button } from '@/components/ui/button';
import { PhotoForm } from '../photo-form';

function BookingRow({ b }: { b: AthleteBooking }) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
      <div>
        <p className="font-medium text-gray-900">
          {b.coachSlug ? (
            <Link href={`/coaches/${b.coachSlug}`} className="hover:underline">
              {b.coachName ?? 'Coach'}
            </Link>
          ) : (
            (b.coachName ?? 'Coach')
          )}
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
      </div>
      <span
        className={`rounded-full px-3 py-1 text-xs font-medium ${bookingStatusTone(b.status)}`}
      >
        {bookingStatusLabel(b.status)}
      </span>
    </li>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: AthleteBooking[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900">
        {title} ({items.length})
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((b) => (
          <BookingRow key={b.id} b={b} />
        ))}
      </ul>
    </div>
  );
}

export default async function AthleteDashboardPage() {
  const user = await requireRole('athlete');
  const [requests, avatarUrl] = await Promise.all([
    getAthleteBookings(user.id),
    getAvatarUrl(user.id),
  ]);

  const waiting = requests.filter((b) => b.status === 'requested');
  const accepted = requests.filter((b) => b.status === 'accepted');
  const archive = requests.filter((b) =>
    ['declined', 'cancelled', 'completed'].includes(b.status)
  );

  return (
    <section className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">
          Athlete dashboard
        </h1>
        <Link
          href="/coaches"
          className="text-sm font-medium text-orange-600 hover:text-orange-700"
        >
          Trova un coach →
        </Link>
      </div>

      <PhotoForm name={user.name} avatarUrl={avatarUrl} />

      {requests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-gray-600">
            Non hai ancora richieste di sessione.
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Sfoglia i coach approvati e invia la tua prima richiesta.
          </p>
          <Button asChild className="mt-4 rounded-full">
            <Link href="/coaches">Trova un coach</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Section title="In attesa" items={waiting} />
          <Section title="Accettate" items={accepted} />
          <Section title="Storico" items={archive} />
        </div>
      )}
    </section>
  );
}
