import Link from 'next/link';
import { ArrowRight, CalendarCheck, Hourglass, ShieldAlert } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { getCoachBookings } from '@/lib/core/bookings';
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
}: {
  athlete: CoachAthleteSummary;
  sportLabel: string | null;
  levelLabel: string | null;
}) {
  return (
    <li>
      <Link
        href={`/dashboard/coach/athletes/${athlete.userId}`}
        className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm"
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
    </li>
  );
}

export default async function CoachAthletesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const user = await requireRole('coach');
  const config = getVerticalConfig();
  const { filtro } = await searchParams;

  const bookings = await getCoachBookings(user.id);
  const all = buildCoachAthletes(bookings);

  const active = all.filter((a) => a.status === 'active');
  const past = all.filter((a) => a.status === 'past');

  // Il filtro sta nell'URL e non in uno stato locale: così la vista è
  // condivisibile, sopravvive a un ricaricamento e il tasto Indietro funziona.
  const filter = filtro === 'conclusi' ? 'conclusi' : filtro === 'tutti' ? 'tutti' : 'percorso';
  const shown =
    filter === 'conclusi' ? past : filter === 'tutti' ? all : active;

  const tabs = [
    { key: 'percorso', label: 'In percorso', count: active.length },
    { key: 'conclusi', label: 'Conclusi', count: past.length },
    { key: 'tutti', label: 'Tutti', count: all.length },
  ] as const;

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">I miei Atleti</h1>
      <p className="mt-1 max-w-2xl text-sm text-gray-600">
        Le persone che segui o che hai seguito. Apri una scheda per il profilo,
        lo storico delle sessioni e il percorso mentale.
      </p>

      {all.length === 0 ? (
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
        <>
          <nav className="mt-6 flex gap-1 border-b border-gray-200">
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                href={`/dashboard/coach/athletes?filtro=${tab.key}`}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  filter === tab.key
                    ? 'border-blue-900 text-blue-900'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                {tab.label} ({tab.count})
              </Link>
            ))}
          </nav>

          {shown.length === 0 ? (
            <p className="mt-6 text-sm text-gray-500">
              Nessun atleta in questa vista.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {shown.map((athlete) => (
                <AthleteRow
                  key={athlete.userId}
                  athlete={athlete}
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
        </>
      )}
    </section>
  );
}
