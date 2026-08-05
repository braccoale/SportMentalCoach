import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Compass,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  Target,
} from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { getCoachBookings, bookingStatusLabel } from '@/lib/core/bookings';
import {
  bookingsForAthlete,
  buildCoachAthletes,
} from '@/lib/core/bookings/coach-athletes';
import { CoachAvatar } from '@/components/coach-visuals';
import { formatDate, formatDateTime, formatMinutes } from '@/lib/core/format';
import { getVerticalConfig, findTaxonomyItem } from '@/lib/core/config';

export const dynamic = 'force-dynamic';

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value}</dd>
    </div>
  );
}

export default async function CoachAthletePage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const user = await requireRole('coach');
  const { athleteId } = await params;
  const targetId = Number(athleteId);
  if (!Number.isInteger(targetId) || targetId <= 0) notFound();

  const config = getVerticalConfig();
  const bookings = await getCoachBookings(user.id);

  // L'autorizzazione nasce dai dati: `getCoachBookings` restituisce solo le
  // prenotazioni di questo coach, quindi un atleta che non compare qui non ha
  // mai lavorato con lui e non deve essere visibile.
  const athlete = buildCoachAthletes(bookings).find(
    (a) => a.userId === targetId
  );
  if (!athlete) notFound();

  const history = bookingsForAthlete(bookings, targetId);
  const sportLabel = athlete.sport
    ? (findTaxonomyItem(config.taxonomies.categories, athlete.sport)?.label ??
      athlete.sport)
    : null;
  const levelLabel = athlete.level
    ? (findTaxonomyItem(config.taxonomies.levels ?? [], athlete.level)?.label ??
      athlete.level)
    : null;

  return (
    <section className="p-6">
      <Link
        href="/dashboard/coach/athletes"
        className="text-sm text-gray-500 hover:text-gray-900"
      >
        ← I miei Atleti
      </Link>

      <header className="mt-3 flex flex-wrap items-start gap-4">
        <CoachAvatar
          name={athlete.name}
          src={athlete.avatarUrl}
          className="size-16 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-gray-900">
              {athlete.name}
            </h1>
            {athlete.isMinor && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                <ShieldAlert className="h-3.5 w-3.5" />
                Minorenne — autorizzazione del tutore richiesta
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {[sportLabel, levelLabel].filter(Boolean).join(' · ') ||
              'Profilo non ancora compilato'}
          </p>
          {athlete.nextSessionAt && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
              Prossima sessione: {formatDateTime(athlete.nextSessionAt)}
            </p>
          )}
        </div>
      </header>

      {/* Profilo */}
      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Target className="h-4 w-4 text-gray-400" />
          Profilo
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Sport" value={sportLabel} />
          <Field label="Livello" value={levelLabel} />
          <Field
            label="Sessioni svolte"
            value={String(athlete.completedSessions)}
          />
        </dl>
        {athlete.goals && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Obiettivi dichiarati
            </dt>
            <dd className="mt-1 text-sm leading-6 text-gray-700">
              {athlete.goals}
            </dd>
          </div>
        )}
      </section>

      {/* Percorso mentale — si popola dai report che il coach ha approvato. */}
      <section className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Compass className="h-4 w-4 text-violet-600" />
          Mental Journey
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Temi ricorrenti, punti da riprendere e impegni presi, costruiti dai
          report delle sessioni che hai approvato.
        </p>
        <Link
          href={`/dashboard/coach/athletes/${athlete.userId}/mental-journey`}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
        >
          <Sparkles className="h-4 w-4" />
          Apri il percorso
        </Link>
      </section>

      {/* Storico */}
      <section className="mt-4">
        <h2 className="text-sm font-semibold text-gray-900">
          Storico delle sessioni ({history.length})
        </h2>
        <ul className="mt-3 flex flex-col divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
          {history.map((booking) => (
            <li
              key={booking.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {booking.scheduledFor
                    ? formatDateTime(booking.scheduledFor)
                    : `Richiesta del ${formatDate(booking.requestedAt)}`}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {[
                    booking.serviceTitle,
                    booking.durationMin
                      ? formatMinutes(booking.durationMin)
                      : null,
                    bookingStatusLabel(booking.status),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <Link
                href={`/dashboard/chat/${booking.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Apri chat
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
