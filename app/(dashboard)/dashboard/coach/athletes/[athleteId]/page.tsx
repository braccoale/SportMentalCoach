import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MessageSquare, Target } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { getCoachBookings, bookingStatusLabel } from '@/lib/core/bookings';
import {
  bookingsForAthlete,
  buildCoachAthletes,
} from '@/lib/core/bookings/coach-athletes';
import { formatDate, formatDateTime, formatMinutes } from '@/lib/core/format';
import { getVerticalConfig, findTaxonomyItem } from '@/lib/core/config';
import {
  FEATURE_CODES,
  hasFeatureEntitlement,
} from '@/lib/core/features';
import {
  MentalJourneyError,
  getMentalJourney,
  type MentalJourney,
} from '@/lib/core/ai-session-notes/mental-journey';
import { mentalJourneyDependencies } from '@/lib/core/ai-session-notes/mental-journey-store';
import {
  MIN_JOURNEY_STAGES,
  buildJourneyStages,
} from '@/lib/core/ai-session-notes/journey-stages';
import {
  buildCommitmentBreakdown,
  buildThemeBars,
} from '@/lib/core/ai-session-notes/journey-panels';
import {
  buildJourneyGoalRows,
  visibleJourneySessions,
} from '@/lib/core/ai-session-notes/journey-goals';
import {
  listGoalSessionLinks,
  listJourneyGoals,
} from '@/lib/core/ai-session-notes/journey-goals-store';
import {
  buildJourneyProgress,
  latestJourneyInsight,
} from '@/lib/core/ai-session-notes/journey-progress';
import {
  addJourneyGoalAction,
  setJourneyGoalStatusAction,
  toggleJourneyGoalSessionAction,
} from './actions';
import { AthleteHeader } from '@/components/session-compass/athlete-header';
import { JourneyPath } from '@/components/session-compass/journey-path';
import { JourneyPathPending } from '@/components/session-compass/journey-path-pending';
import { JourneyGoalsPanel } from '@/components/session-compass/journey-goals';
import { JourneyProgressPanel } from '@/components/session-compass/journey-progress';
import {
  JourneyCommitmentsPanel,
  JourneyThemesPanel,
} from '@/components/session-compass/journey-panels';

export const dynamic = 'force-dynamic';

/**
 * Il percorso è un di più: se non è leggibile — la funzionalità è spenta,
 * l'atleta non ne ha ancora uno — la scheda resta quella di prima invece di
 * andare in errore. La stessa autorizzazione la riapplica `getMentalJourney`.
 */
async function loadJourney(
  athleteUserId: number,
  actorUserId: number,
  since: Date | null
): Promise<MentalJourney | null> {
  try {
    return await getMentalJourney(
      { athleteUserId, actorUserId, since },
      mentalJourneyDependencies()
    );
  } catch (error) {
    if (error instanceof MentalJourneyError) return null;
    throw error;
  }
}

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
  searchParams,
}: {
  params: Promise<{ athleteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole('coach');
  const [{ athleteId }, query] = await Promise.all([params, searchParams]);
  const targetId = Number(athleteId);
  if (!Number.isInteger(targetId) || targetId <= 0) notFound();

  const config = getVerticalConfig();
  const [bookings, hasAiSessionNotes] = await Promise.all([
    getCoachBookings(user.id),
    hasFeatureEntitlement(user.id, FEATURE_CODES.AI_SESSION_NOTES),
  ]);

  // L'autorizzazione nasce dai dati: `getCoachBookings` restituisce solo le
  // prenotazioni di questo coach, quindi un atleta che non compare qui non ha
  // mai lavorato con lui e non deve essere visibile.
  const athlete = buildCoachAthletes(bookings).find(
    (a) => a.userId === targetId
  );
  if (!athlete) notFound();

  const history = bookingsForAthlete(bookings, targetId);
  // Un riepilogo pronto e non approvato è lavoro già fatto che non entra nel
  // percorso: finora nessuna schermata lo diceva a chi apriva la scheda.
  const awaitingReview = history.filter(
    (booking) => booking.aiReportStatus === 'ready_for_review'
  ).length;
  const [journey, storedGoals] = await Promise.all([
    hasAiSessionNotes
      ? loadJourney(targetId, user.id, null)
      : Promise.resolve(null),
    hasAiSessionNotes
      ? listJourneyGoals({ coachUserId: user.id, athleteUserId: targetId })
      : Promise.resolve([]),
  ]);
  // Le sedute gia' in agenda: il percorso non finisce sull'ultima fatta.
  const now = new Date();
  const plannedSessions = history
    .filter(
      (booking) =>
        booking.status === 'accepted' &&
        booking.scheduledFor != null &&
        booking.scheduledFor.getTime() > now.getTime()
    )
    .map((booking) => ({
      bookingId: booking.id,
      scheduledFor: booking.scheduledFor!.toISOString(),
      serviceTitle: booking.serviceTitle,
    }));

  const goalLinks = await listGoalSessionLinks(storedGoals.map((g) => g.id));

  const stages = journey
    ? buildJourneyStages(journey.timeline, { planned: plannedSessions })
    : [];
  const athletePath = `/dashboard/coach/athletes/${athlete.userId}`;
  const mentalJourneyHref = `${athletePath}/mental-journey`;

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

      <div className="mt-3">
        <AthleteHeader
          name={athlete.name}
          avatarUrl={athlete.avatarUrl}
          age={athlete.age}
          sportLabel={sportLabel}
          levelLabel={levelLabel}
          isMinor={athlete.isMinor}
          nextSessionAt={athlete.nextSessionAt}
          sportKey={athlete.sport}
          completedSessions={athlete.completedSessions}
          commitmentsTotal={journey?.summary.commitments.total ?? 0}
          since={
            journey?.summary.firstSessionDate
              ? new Date(journey.summary.firstSessionDate)
              : null
          }
          exportHref={
            journey && journey.summary.approvedSessionCount > 0
              ? `/api/coach/athletes/${athlete.userId}/journey-export`
              : null
          }
          mentalJourneyHref={hasAiSessionNotes ? mentalJourneyHref : null}
        />
      </div>

      {/* Il percorso — la prima risposta della pagina: dove siamo arrivati.
          Sta in cima perché è la domanda con cui un coach apre la scheda di
          una persona; il profilo e lo storico rispondono a domande che vengono
          dopo.

          La soglia è una sola, `MIN_JOURNEY_STAGES`, e la decide il dominio.
          Prima il blocco si apriva a «almeno una tappa» mentre la striscia si
          disegna da due: con una tappa sola i riquadri comparivano, la
          striscia spariva senza una parola, e il riquadro di ripiego non
          scattava perché le tappe non erano zero. Due soglie diverse sullo
          stesso fatto, e in mezzo il silenzio. */}
      {hasAiSessionNotes && journey && (
        <div className="mt-6 flex flex-col gap-4">
          {stages.length >= MIN_JOURNEY_STAGES ? (
            <JourneyPath
              stages={stages}
              // Tutta la cronistoria, non le sole approvate: da quando la
              // striscia mostra anche le bozze, contare solo quelle validate
              // faceva dire «tutte le sessioni (1)» sotto due card.
              totalSessions={journey.timeline.length}
              allSessionsHref={mentalJourneyHref}
            />
          ) : (
            <JourneyPathPending
              approvedSessions={journey.summary.approvedSessionCount}
              awaitingReview={awaitingReview}
              reviewHref={
                athlete.latestCompassBookingId
                  ? `/dashboard/appointments/${athlete.latestCompassBookingId}#session-compass`
                  : null
              }
              mentalJourneyHref={mentalJourneyHref}
            />
          )}

          {/* La griglia del disegno: gli obiettivi tengono la colonna larga
              perché sono il filo del percorso, e i due riquadri che li
              commentano stanno in colonna accanto. Sotto, il progresso occupa
              la stessa larghezza degli obiettivi: parla di loro. */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <JourneyGoalsPanel
                rows={buildJourneyGoalRows({
                  goals: storedGoals,
                  timeline: journey.timeline,
                  links: goalLinks,
                })}
                athleteUserId={athlete.userId}
                sessions={visibleJourneySessions(journey.timeline)}
                addGoalAction={addJourneyGoalAction}
                setStatusAction={setJourneyGoalStatusAction}
                toggleSessionAction={toggleJourneyGoalSessionAction}
              />

              <JourneyProgressPanel
                progress={buildJourneyProgress(journey.timeline)}
                insight={latestJourneyInsight(journey.timeline)}
              />
            </div>

            <div className="flex flex-col gap-4">
              <JourneyCommitmentsPanel
                breakdown={buildCommitmentBreakdown(journey.summary)}
                allCommitmentsHref={`${mentalJourneyHref}#mental-journey-follow-through`}
              />
              <JourneyThemesPanel
                bars={buildThemeBars(
                  journey.recurringThemes,
                  journey.summary.approvedSessionCount
                )}
                approvedSessionCount={journey.summary.approvedSessionCount}
                detailsHref={`${mentalJourneyHref}#mental-journey-themes`}
              />
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
