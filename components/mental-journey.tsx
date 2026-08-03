import Link from 'next/link';
import { ArrowUpRight, Compass, Sparkles } from 'lucide-react';
import type {
  FollowThroughItem,
  JourneyCommitment,
  MentalJourney,
  MentalJourneyEntry,
  PointToRevisit,
  RecurringTheme,
} from '@/lib/core/ai-session-notes/mental-journey';
import type { TrackedCommitmentStatus } from '@/lib/core/ai-session-notes/session-commitments';

/**
 * Vista storica del percorso, riservata al coach.
 *
 * È una lettura, non un cruscotto: nessun grafico, nessun punteggio, nessuna
 * modifica. Le azioni operative restano nel Session Compass, raggiungibile da
 * ogni card.
 */

const STATUS_STYLE: Record<
  TrackedCommitmentStatus,
  { label: string; chip: string; dot: string }
> = {
  completed: {
    label: 'Completato',
    chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    dot: 'bg-emerald-500',
  },
  in_progress: {
    label: 'In corso',
    chip: 'bg-blue-50 text-blue-800 ring-blue-200',
    dot: 'bg-blue-500',
  },
  pending: {
    label: 'Da fare',
    chip: 'bg-gray-50 text-gray-700 ring-gray-200',
    dot: 'bg-gray-400',
  },
  skipped: {
    label: 'Da riprendere',
    chip: 'bg-amber-50 text-amber-900 ring-amber-200',
    dot: 'bg-amber-500',
  },
};

const SOURCE_TONE: Record<PointToRevisit['source'], string> = {
  recurring_theme: 'text-violet-700',
  open_commitment: 'text-blue-700',
  missed_commitment: 'text-amber-800',
  next_session_prep: 'text-gray-600',
};

export function formatJourneyDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat('it-IT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Rome',
      }).format(date);
}

function StatusChip({ status, overdue }: { status: TrackedCommitmentStatus; overdue?: boolean }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${style.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {style.label}
      {overdue ? <span className="font-normal">· in ritardo</span> : null}
    </span>
  );
}

function CommitmentLine({ commitment }: { commitment: JourneyCommitment }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-800">
      <StatusChip status={commitment.status} overdue={commitment.isOverdue} />
      <span className="min-w-0 flex-1">{commitment.title}</span>
      <span className="text-xs text-gray-500">
        {commitment.owner === 'coach' ? 'Coach' : 'Atleta'}
        {commitment.dueDate ? ` · entro il ${formatJourneyDate(commitment.dueDate)}` : ''}
      </span>
    </li>
  );
}

export function MentalJourneyEmptyState({ athleteName }: { athleteName: string | null }) {
  return (
    <section className="rounded-3xl border border-dashed border-violet-200 bg-white p-10 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-violet-50">
        <Compass className="h-7 w-7 text-violet-600" />
      </span>
      <h2 className="mt-4 text-xl font-bold tracking-tight text-gray-950">
        Il percorso inizia dal primo report approvato
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-600">
        {athleteName ? `Con ${athleteName} non c’è` : 'Non c’è'} ancora nessuna sessione con un
        Session Compass approvato. Appena approvi il primo report, qui troverai la memoria del
        percorso: temi, impegni e continuità nel tempo.
      </p>
    </section>
  );
}

function SummaryHeader({ journey, athleteName }: { journey: MentalJourney; athleteName: string | null }) {
  const { summary } = journey;
  const from = formatJourneyDate(summary.firstSessionDate);
  const to = formatJourneyDate(summary.lastSessionDate);
  const period = from && to && from !== to ? `Dal ${from} al ${to}` : from ? `Dal ${from}` : null;

  return (
    <header className="rounded-3xl bg-gradient-to-br from-violet-50 via-white to-white p-6 ring-1 ring-violet-100 sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-700">
        Mental Journey
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
        {athleteName ? `Il percorso di ${athleteName}` : 'Il percorso'}
      </h1>
      {period ? <p className="mt-2 text-sm text-gray-600">{period}</p> : null}

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Sessioni approvate" value={summary.approvedSessionCount} />
        <Stat label="Impegni concordati" value={summary.commitments.total} />
        <Stat label="Completati" value={summary.commitments.completed} tone="text-emerald-700" />
        <Stat
          label="Da riprendere"
          value={summary.commitments.skipped}
          tone="text-amber-800"
        />
      </dl>

      {summary.completionRate === null ? (
        <p className="mt-4 text-xs text-gray-500">
          Ancora pochi impegni per una lettura d’insieme: qui trovi i numeri, non una percentuale.
        </p>
      ) : (
        <p className="mt-4 text-xs text-gray-500">
          {summary.completionRate}% degli impegni risulta completato.
        </p>
      )}
    </header>
  );
}

function Stat({
  label,
  value,
  tone = 'text-gray-950',
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-bold tracking-tight ${tone}`}>{value}</dd>
    </div>
  );
}

export function RecurringThemesSection({ themes }: { themes: readonly RecurringTheme[] }) {
  if (!themes.length) return null;
  return (
    <section aria-labelledby="mental-journey-themes">
      <h2 id="mental-journey-themes" className="text-lg font-semibold text-gray-950">
        Temi ricorrenti
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {themes.map((theme) => (
          <li
            key={theme.key}
            className="rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-gray-200"
          >
            <p className="font-medium text-gray-950">{theme.label}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {theme.description}
              {formatJourneyDate(theme.firstSeenAt)
                ? ` · dal ${formatJourneyDate(theme.firstSeenAt)}`
                : ''}
              {formatJourneyDate(theme.lastSeenAt)
                ? ` all’${formatJourneyDate(theme.lastSeenAt)}`
                : ''}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PointsToRevisitSection({ points }: { points: readonly PointToRevisit[] }) {
  if (!points.length) return null;
  return (
    <section
      aria-labelledby="mental-journey-revisit"
      className="rounded-3xl bg-white p-6 ring-1 ring-gray-200"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-600" />
        <h2 id="mental-journey-revisit" className="text-lg font-semibold text-gray-950">
          Da riprendere
        </h2>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        Spunti ricavati da report già approvati e dallo stato reale degli impegni.
      </p>
      <ul className="mt-4 space-y-3">
        {points.map((point) => (
          <li key={point.id} className="border-l-2 border-violet-200 pl-3">
            <p className="text-sm text-gray-900">{point.text}</p>
            <p className={`mt-0.5 text-xs ${SOURCE_TONE[point.source]}`}>{point.sourceLabel}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FollowThroughSection({ items }: { items: readonly FollowThroughItem[] }) {
  if (!items.length) return null;
  return (
    <section
      aria-labelledby="mental-journey-follow-through"
      className="rounded-3xl bg-white p-6 ring-1 ring-gray-200"
    >
      <h2 id="mental-journey-follow-through" className="text-lg font-semibold text-gray-950">
        Impegni in corso
      </h2>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.commitmentId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusChip status={item.status} overdue={item.isOverdue} />
            <span className="min-w-0 flex-1 text-sm text-gray-900">{item.title}</span>
            <Link
              href={`/dashboard/appointments/${item.bookingId}`}
              className="text-xs text-gray-500 underline"
            >
              {item.owner === 'coach' ? 'Coach' : 'Atleta'} · sessione
              {formatJourneyDate(item.sessionDate) ? ` del ${formatJourneyDate(item.sessionDate)}` : ''}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TimelineCard({ entry }: { entry: MentalJourneyEntry }) {
  const when = formatJourneyDate(entry.sessionDate ?? entry.approvedAt);
  return (
    <li className="relative pl-8">
      <span
        className="absolute left-0 top-6 h-3 w-3 -translate-x-1/2 rounded-full bg-violet-500 ring-4 ring-white"
        aria-hidden="true"
      />
      <article className="rounded-3xl bg-white p-6 ring-1 ring-gray-200">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-gray-950">{when ?? 'Sessione'}</h3>
          <span className="text-xs text-gray-500">con {entry.coachName}</span>
        </div>

        <p className="mt-3 text-sm leading-6 text-gray-800">{entry.summary}</p>

        {entry.themes.length ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {entry.themes.map((theme) => (
              <li
                key={theme}
                className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-800"
              >
                {theme}
              </li>
            ))}
          </ul>
        ) : null}

        {entry.emergingResource ? (
          <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <span className="font-semibold">Risorsa emersa. </span>
            {entry.emergingResource}
          </p>
        ) : null}

        {entry.commitments.length ? (
          <ul className="mt-4 space-y-2 border-t border-gray-100 pt-4">
            {entry.commitments.map((commitment) => (
              <CommitmentLine key={commitment.commitmentId} commitment={commitment} />
            ))}
          </ul>
        ) : null}

        <Link
          href={entry.compassHref}
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:text-violet-900"
        >
          Apri il Session Compass
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </article>
    </li>
  );
}

export function MentalJourneyView({
  journey,
  athleteName,
}: {
  journey: MentalJourney;
  athleteName: string | null;
}) {
  if (!journey.timeline.length) {
    return <MentalJourneyEmptyState athleteName={athleteName} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <SummaryHeader journey={journey} athleteName={athleteName} />

      <PointsToRevisitSection points={journey.pointsToRevisit} />
      <RecurringThemesSection themes={journey.recurringThemes} />
      <FollowThroughSection items={journey.followThrough} />

      <section aria-labelledby="mental-journey-timeline">
        <h2 id="mental-journey-timeline" className="text-lg font-semibold text-gray-950">
          La storia del percorso
        </h2>
        <ol className="mt-4 space-y-6 border-l border-violet-100">
          {journey.timeline.map((entry) => (
            <TimelineCard key={entry.sessionId} entry={entry} />
          ))}
        </ol>
      </section>

      <p className="text-xs text-gray-500">
        Questa vista è riservata al coach e sola lettura: raccoglie soltanto report già approvati e
        lo stato reale degli impegni. Non contiene valutazioni cliniche.
      </p>
    </div>
  );
}
