import { CalendarClock, Users } from 'lucide-react';
import { CollapsiblePanel } from '@/components/collapsible-panel';
import { CoachAvatar } from '@/components/coach-visuals';
import { getVerticalConfig, findTaxonomyItem } from '@/lib/core/config';
import { formatDate, formatDateTime } from '@/lib/core/format';
import type { TaxonomyItem } from '@/lib/core/config/types';
import type { CoachRoster } from '@/lib/core/admin/coach-roster';

/**
 * Chi segue un coach e cosa ha in agenda, dentro la riga del coach.
 *
 * Chiuso di suo: la riga esiste per approvare o verificare un profilo, e sei
 * elenchi aperti sotto ogni coach renderebbero la pagina illeggibile proprio
 * dove si lavora. Chiuso però non vuol dire muto — l'intestazione porta il
 * numero di atleti, quanti sono in percorso e quando è il prossimo
 * appuntamento: le tre risposte che di solito bastano, senza aprire niente.
 */
export function CoachRosterBlock({
  roster,
  sportsList,
}: {
  roster: CoachRoster;
  sportsList: TaxonomyItem[];
}) {
  const config = getVerticalConfig();
  const nextSession = roster.upcoming[0];

  return (
    <div className="grid items-start gap-2 md:grid-cols-2">
      <CollapsiblePanel
        size="inline"
        defaultOpen={false}
        title="Atleti seguiti"
        count={roster.athletes.length}
        hint={
          roster.activeAthletes > 0
            ? `${roster.activeAthletes} in percorso`
            : 'nessuno in percorso'
        }
      >
        {roster.athletes.length === 0 ? (
          <p className="text-xs text-gray-500">
            Nessun atleta ha mai prenotato con questo coach.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {roster.athletes.map((athlete) => {
              const sport = athlete.sport
                ? findTaxonomyItem(sportsList, athlete.sport)?.label ??
                  athlete.sport
                : null;
              const level = athlete.level
                ? findTaxonomyItem(
                    config.taxonomies.levels ?? [],
                    athlete.level
                  )?.label ?? athlete.level
                : null;

              return (
                <li
                  key={athlete.userId}
                  className="flex items-start gap-2 rounded-lg bg-white p-2 ring-1 ring-gray-200"
                >
                  <CoachAvatar
                    name={athlete.name}
                    src={athlete.avatarUrl}
                    className="size-8"
                  />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-gray-900">
                      {athlete.name}
                      {athlete.isMinor && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                          Minore
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          athlete.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                            : 'bg-gray-100 text-gray-600 ring-1 ring-gray-200'
                        }`}
                      >
                        {athlete.status === 'active'
                          ? 'In percorso'
                          : 'Percorso concluso'}
                      </span>
                    </p>
                    {(sport || level) && (
                      <p className="text-xs text-gray-500">
                        {[sport, level].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
                      <span>
                        {athlete.completedSessions === 1
                          ? '1 seduta svolta'
                          : `${athlete.completedSessions} sedute svolte`}
                      </span>
                      {athlete.nextSessionAt ? (
                        <span className="text-emerald-700">
                          Prossima: {formatDateTime(athlete.nextSessionAt)}
                        </span>
                      ) : athlete.lastSessionAt ? (
                        <span>Ultima: {formatDate(athlete.lastSessionAt)}</span>
                      ) : (
                        <span>Nessuna seduta svolta</span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CollapsiblePanel>

      <CollapsiblePanel
        size="inline"
        defaultOpen={false}
        title="Prossimi appuntamenti"
        count={roster.upcoming.length}
        hint={
          nextSession
            ? `il primo ${formatDateTime(nextSession.scheduledFor)}`
            : 'agenda vuota'
        }
      >
        {roster.upcoming.length === 0 ? (
          <p className="text-xs text-gray-500">
            Nessun appuntamento in programma.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {roster.upcoming.map((session) => (
              <li
                key={session.bookingId}
                className="rounded-lg bg-white p-2 ring-1 ring-gray-200"
              >
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-gray-900">
                  <CalendarClock
                    aria-hidden="true"
                    className="size-3.5 text-gray-400"
                  />
                  {formatDateTime(session.scheduledFor)}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      session.status === 'accepted'
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                    }`}
                  >
                    {session.status === 'accepted'
                      ? 'Confermato'
                      : 'Da confermare'}
                  </span>
                </p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                  <Users aria-hidden="true" className="size-3.5" />
                  {session.athleteName}
                  {session.serviceTitle ? ` · ${session.serviceTitle}` : ''}
                  {session.durationMin ? ` · ${session.durationMin} min` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CollapsiblePanel>
    </div>
  );
}
