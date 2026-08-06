import Link from 'next/link';
import {
  ArrowRight,
  CalendarCheck,
  Compass,
  Hourglass,
  ShieldAlert,
} from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { getCoachBookings } from '@/lib/core/bookings';
import { FEATURE_CODES, hasFeatureEntitlement } from '@/lib/core/features';
import {
  buildCoachAthletes,
  type CoachAthleteSummary,
} from '@/lib/core/bookings/coach-athletes';
import { CoachAvatar } from '@/components/coach-visuals';
import { formatDate, formatDateTime } from '@/lib/core/format';
import { getVerticalConfig, findTaxonomyItem } from '@/lib/core/config';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'I miei Atleti — KaiPai' };

function AthleteRow({
  athlete,
  sportLabel,
  levelLabel,
  canOpenCompass,
}: {
  athlete: CoachAthleteSummary;
  sportLabel: string | null;
  levelLabel: string | null;
  canOpenCompass: boolean;
}) {
  return (
    <li>
      <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm">
        <Link
          href={`/dashboard/coach/athletes/${athlete.userId}`}
          className="flex min-w-0 flex-1 items-center gap-4"
        >
          <CoachAvatar
            name={athlete.name}
            src={athlete.avatarUrl}
            className="size-12 shrink-0"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold text-gray-900">
                {athlete.name}
              </p>
              {athlete.isMinor && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                  <ShieldAlert className="h-3 w-3" />
                  Minorenne
                </span>
              )}
              {athlete.pendingRequests > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                  <Hourglass className="h-3 w-3" />
                  {athlete.pendingRequests} da valutare
                </span>
              )}
            </div>

            <p className="mt-0.5 truncate text-sm text-gray-500">
              {[
                sportLabel,
                levelLabel,
                `${athlete.completedSessions} ${
                  athlete.completedSessions === 1 ? 'sessione' : 'sessioni'
                }`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>

            <p className="mt-1 text-sm">
              {athlete.nextSessionAt ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-green-700">
                  <CalendarCheck className="h-4 w-4" />
                  Prossima: {formatDateTime(athlete.nextSessionAt)}
                </span>
              ) : athlete.lastSessionAt ? (
                <span className="text-gray-500">
                  Ultima sessione il {formatDate(athlete.lastSessionAt)}
                </span>
              ) : (
                <span className="text-gray-400">Nessuna sessione svolta</span>
              )}
            </p>
          </div>

          <ArrowRight className="h-5 w-5 shrink-0 text-gray-300" />
        </Link>
        {canOpenCompass && athlete.latestCompassBookingId ? (
          <Link
            href={`/dashboard/appointments/${athlete.latestCompassBookingId}#session-compass`}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          >
            <Compass className="h-4 w-4" />
            <span className="hidden sm:inline">Apri </span>Riepilogo sessione
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export default async function CoachAthletesPage() {
  const user = await requireRole('coach');
  const config = getVerticalConfig();

  const [bookings, hasAiSessionNotes] = await Promise.all([
    getCoachBookings(user.id),
    hasFeatureEntitlement(user.id, FEATURE_CODES.AI_SESSION_NOTES),
  ]);
  const athletes = buildCoachAthletes(bookings);

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">I miei Atleti</h1>
      <p className="mt-1 max-w-2xl text-sm text-gray-600">
        Tutti gli atleti che segui o hai seguito, ordinati per attività recente
        e numero di sessioni. Apri una scheda per il profilo, lo storico e il
        percorso mentale.
      </p>

      {athletes.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-gray-300 p-8 text-center">
          <p className="font-medium text-gray-700">
            Non hai ancora nessun atleta.
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Comparirà qui la prima persona che ti invia una richiesta di
            sessione.
          </p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {athletes.map((athlete) => (
            <AthleteRow
              key={athlete.userId}
              athlete={athlete}
              canOpenCompass={hasAiSessionNotes}
              levelLabel={
                athlete.level
                  ? (findTaxonomyItem(
                      config.taxonomies.levels ?? [],
                      athlete.level
                    )?.label ?? athlete.level)
                  : null
              }
              sportLabel={
                athlete.sport
                  ? (findTaxonomyItem(
                      config.taxonomies.categories,
                      athlete.sport
                    )?.label ?? athlete.sport)
                  : null
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}
