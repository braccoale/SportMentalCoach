import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Compass,
  Handshake,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  Target,
} from 'lucide-react';
import type {
  FollowThroughItem,
  JourneyCommitment,
  JourneyMetric,
  MentalJourney,
  MentalJourneyEntry,
  PointToRevisit,
  RecurringTheme,
} from '@/lib/core/ai-session-notes/mental-journey';
import {
  buildMetricTrend,
  metricTrendLabel,
  type MetricTrend,
} from '@/lib/core/ai-session-notes/metric-trend';
import { METRIC_META } from '@/components/session-compass/metric-model';
import type { TrackedCommitmentStatus } from '@/lib/core/ai-session-notes/session-commitments';

/**
 * Vista storica del percorso, riservata al coach.
 *
 * È una lettura, non un cruscotto: nessun punteggio, nessuna modifica. Le
 * azioni operative restano nel Riepilogo sessione, raggiungibile da ogni card.
 *
 * La pagina si apre su una vetta perché è ciò che il coach sta guardando
 * quando la apre: non la seduta di oggi, ma la distanza percorsa. Il resto
 * della pagina è deliberatamente sobrio — l'immagine dà il tono una volta, poi
 * si toglie di mezzo e lascia leggere.
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

/** Giorno, mese e anno separati: il blocco data della timeline li impagina. */
function dateParts(value: string | null): { day: string; month: string; year: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('it-IT', { ...options, timeZone: 'Europe/Rome' }).format(date);
  return {
    day: format({ day: '2-digit' }),
    month: format({ month: 'short' }).replace('.', '').toUpperCase(),
    year: format({ year: 'numeric' }),
  };
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
    <section className="overflow-hidden rounded-3xl border border-violet-100 bg-white">
      <div className="relative h-40 sm:h-56">
        <Image
          src="/decor/journey.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_35%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/40 to-transparent" />
      </div>
      <div className="px-6 pb-10 pt-2 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-violet-50">
          <Compass className="h-7 w-7 text-violet-600" />
        </span>
        <h2 className="mt-4 text-xl font-bold tracking-tight text-gray-950">
          Il percorso inizia dal primo report approvato
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-600">
          {athleteName ? `Con ${athleteName} non c’è` : 'Non c’è'} ancora nessuna sessione con un
          Riepilogo sessione approvato. Appena approvi il primo report, qui troverai la memoria del
          percorso: temi, impegni e continuità nel tempo.
        </p>
      </div>
    </section>
  );
}

/**
 * L'apertura: la vetta, il nome, i quattro numeri.
 *
 * L'immagine sta a destra e sfuma nel bianco verso sinistra, dove vive il
 * testo: una foto sotto le parole le renderebbe illeggibili, e un velo scuro
 * su tutta la fascia avrebbe reso cupa una pagina che parla di strada fatta.
 */
function SummaryHeader({
  journey,
  athleteName,
}: {
  journey: MentalJourney;
  athleteName: string | null;
}) {
  const { summary } = journey;
  const from = formatJourneyDate(summary.firstSessionDate);
  const to = formatJourneyDate(summary.lastSessionDate);
  const period = from && to && from !== to ? `Dal ${from} al ${to}` : from ? `Dal ${from}` : null;

  return (
    <header className="relative isolate overflow-hidden rounded-3xl bg-white ring-1 ring-gray-200">
      <div className="absolute inset-0 -z-10">
        <Image
          src="/decor/journey.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 900px, 100vw"
          // Contrasto e saturazione alzati: la foto originale e' tenue e
          // sotto un velo bianco spariva del tutto.
          className="object-cover object-[65%_center] contrast-150 saturate-125"
        />
        {/*
         * Un velo solo, e che finisce presto.
         *
         * Prima ce n'erano due sovrapposti e insieme cancellavano la foto:
         * restava una fascia bianca. Ora copre solo la colonna del testo e si
         * dissolve entro meta' fascia, cosi' la montagna si vede davvero.
         */}
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/75 to-transparent sm:via-white/55 sm:to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white/70 to-transparent" />
      </div>

      <div className="p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">
          Mental Journey
        </p>
        <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-gray-950 sm:text-[2.5rem]">
          Il percorso di
          <br />
          <span className="text-gray-950">{athleteName ?? 'questo atleta'}</span>
        </h1>
        {period ? <p className="mt-2 text-sm text-gray-600">{period}</p> : null}

        <dl className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat
            label="Sessioni approvate"
            value={summary.approvedSessionCount}
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="text-violet-700"
          />
          <Stat
            label="Impegni concordati"
            value={summary.commitments.total}
            icon={<Handshake className="h-4 w-4" />}
            tone="text-violet-700"
          />
          <Stat
            label="Completati"
            value={summary.commitments.completed}
            icon={<Target className="h-4 w-4" />}
            tone="text-emerald-700"
          />
          <Stat
            label="Da riprendere"
            value={summary.commitments.skipped}
            icon={<RotateCcw className="h-4 w-4" />}
            tone="text-amber-700"
          />
        </dl>

        {summary.completionRate === null ? (
          <p className="mt-4 max-w-xl text-xs text-gray-600">
            Ancora pochi impegni per una lettura d’insieme: qui trovi i numeri, non una percentuale.
          </p>
        ) : (
          <p className="mt-4 max-w-xl text-xs text-gray-600">
            {summary.completionRate}% degli impegni risulta completato.
          </p>
        )}
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div // Traslucidi di proposito: la montagna passa attraverso i riquadri
      // invece di fermarsi dietro. Il `backdrop-blur` tiene i numeri leggibili
      // sopra qualunque parte dell'immagine finisca sotto.
      className="rounded-2xl bg-white/30 p-4 shadow-sm ring-1 ring-white/50 backdrop-blur-md">
      <dt className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-700">
        <span className={tone} aria-hidden="true">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="mt-2 text-3xl font-bold tracking-tight text-gray-950">{value}</dd>
    </div>
  );
}

export function RecurringThemesSection({ themes }: { themes: readonly RecurringTheme[] }) {
  if (!themes.length) return null;
  return (
    <section aria-labelledby="mental-journey-themes">
      <h2
        id="mental-journey-themes"
        className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500"
      >
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

/**
 * «Da riprendere»: che cosa portare alla prossima seduta.
 *
 * `heading` esiste perché questa sezione vive in due posti che fanno la
 * stessa domanda in due momenti diversi: nella scheda dell'atleta è una voce
 * fra le altre, sulla pagina della seduta in arrivo è **la** ragione per cui
 * quella pagina si apre prima dell'incontro. Stesso contenuto, due titoli.
 */
export function PointsToRevisitSection({
  points,
  heading,
  intro,
}: {
  points: readonly PointToRevisit[];
  heading?: string;
  intro?: string;
}) {
  if (!points.length) return null;
  return (
    <section
      aria-labelledby="mental-journey-revisit"
      className="h-full rounded-3xl bg-white p-6 ring-1 ring-gray-200"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-600" />
        <h2
          id="mental-journey-revisit"
          className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500"
        >
          {heading ?? 'Da riprendere'}
        </h2>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        {intro ??
          'Spunti ricavati dai riepiloghi delle sedute e dallo stato reale degli impegni.'}
      </p>
      <ul className="mt-4 space-y-2">
        {points.map((point) => (
          <li
            key={point.id}
            className="rounded-2xl bg-gray-50/80 px-4 py-3 ring-1 ring-gray-100"
          >
            <p className="text-sm leading-6 text-gray-900">{point.text}</p>
            <p className={`mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs ${SOURCE_TONE[point.source]}`}>
              {point.sourceLabel}
              {/* Un punto preso da una bozza non è sbagliato, ma nessuno l'ha
                  ancora letto — e da qui diventa il piano della seduta. La
                  differenza va detta dove la si usa, non nella pagina del
                  riepilogo. */}
              {point.fromDraft && (
                <span
                  title="Viene da un riepilogo che non hai ancora validato: il testo è quello che ha prodotto il sistema."
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                >
                  <Clock3 className="h-3 w-3" aria-hidden="true" />
                  Da validare
                </span>
              )}
            </p>
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
      className="h-full rounded-3xl bg-white p-6 ring-1 ring-gray-200"
    >
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-violet-600" />
        <h2
          id="mental-journey-follow-through"
          className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500"
        >
          Impegni in corso
        </h2>
      </div>
      {/* Una guida verticale lega gli impegni fra loro: sono lo stesso filo,
          non voci di un elenco qualsiasi. */}
      <ul className="mt-4 space-y-3 border-l border-violet-100 pl-4">
        {items.map((item) => (
          <li key={item.commitmentId} className="relative">
            <span
              className="absolute -left-[1.3rem] top-2 h-2.5 w-2.5 rounded-full bg-white ring-2 ring-violet-400"
              aria-hidden="true"
            />
            <div className="rounded-2xl bg-gray-50/80 px-4 py-3 ring-1 ring-gray-100">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <StatusChip status={item.status} overdue={item.isOverdue} />
                <span className="min-w-0 flex-1 text-sm leading-6 text-gray-900">{item.title}</span>
              </div>
              <Link
                href={`/dashboard/appointments/${item.bookingId}`}
                className="mt-1 block text-right text-xs text-violet-700 hover:underline"
              >
                {item.owner === 'coach' ? 'Coach' : 'Atleta'} — sessione
                {formatJourneyDate(item.sessionDate)
                  ? ` del ${formatJourneyDate(item.sessionDate)}`
                  : ''}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * L'andamento di una metrica fino a questa seduta.
 *
 * Stessa disciplina del riepilogo: servono almeno tre sedute con quella
 * metrica, perché con due punti una linea non è una tendenza e disegnarla
 * suggerirebbe una precisione che il dato non ha. Il valore resta scritto
 * accanto: la linea orienta, il numero dice.
 */
function EntryTrend({ metric, trend }: { metric: JourneyMetric; trend: MetricTrend }) {
  const meta = METRIC_META[metric.key];
  return (
    <figure className="shrink-0 text-right">
      <figcaption className="text-[11px] font-semibold text-gray-500">
        {meta.label} {metric.value}/5
      </figcaption>
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="mt-1 h-8 w-24 overflow-visible"
        role="img"
        aria-label={`${meta.label}: ${metricTrendLabel(trend).toLowerCase()} su ${trend.values.length} sedute`}
      >
        <polyline
          points={trend.polyline
            .split(' ')
            .map((pair) => {
              const [x, y] = pair.split(',');
              return `${x},${(Number(y) * 0.4).toFixed(1)}`;
            })
            .join(' ')}
          fill="none"
          stroke={meta.color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </figure>
  );
}

function TimelineCard({
  entry,
  trend,
}: {
  entry: MentalJourneyEntry;
  trend: { metric: JourneyMetric; trend: MetricTrend } | null;
}) {
  const parts = dateParts(entry.sessionDate ?? entry.approvedAt);
  const when = formatJourneyDate(entry.sessionDate ?? entry.approvedAt);

  return (
    <li className="relative pl-8 sm:pl-10">
      <span
        className="absolute left-0 top-8 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white ring-[3px] ring-violet-500"
        aria-hidden="true"
      />
      <article className="rounded-3xl bg-white p-5 ring-1 ring-gray-200 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row">
          {/* Il blocco data: si scorre la colonna e si legge il ritmo del
              percorso senza entrare in nessuna scheda. */}
          <div // `self-start`: senza, la riga flex allunga il blocco per tutta
            // l'altezza della scheda e la data galleggia in una colonna vuota.
            className="flex shrink-0 flex-row items-baseline gap-2 self-start rounded-2xl bg-gray-50 px-4 py-3 text-center ring-1 ring-gray-100 sm:w-20 sm:flex-col sm:gap-0">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700">
              {parts?.month ?? '—'}
            </span>
            <span className="text-2xl font-bold leading-none text-gray-950">
              {parts?.day ?? ''}
            </span>
            <span className="text-[11px] text-gray-500">{parts?.year ?? when ?? ''}</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-sm leading-6 text-gray-800">{entry.summary}</p>
              {/* Qui, a differenza della striscia in cima, si mostra anche il
                  negativo: questa e' la cronologia completa, e la domanda che
                  ci si fa scorrendola e' «di tutte queste, quali non gli ho
                  ancora consegnato». Una colonna che tace sulle non condivise
                  non risponde. */}
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-xs text-gray-500">con {entry.coachName}</span>
                {entry.sharedAt ? (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700"
                    title={`Condiviso con l’atleta il ${formatJourneyDate(entry.sharedAt)}`}
                  >
                    <Send className="h-3 w-3" aria-hidden="true" />
                    Condiviso
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-gray-400">
                    Non condiviso
                  </span>
                )}
              </div>
            </div>

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
              <p className="mt-3 flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
                <Star className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                <span>
                  <span className="font-semibold">Risorsa emersa. </span>
                  {entry.emergingResource}
                </span>
              </p>
            ) : null}

            {entry.commitments.length ? (
              <ul className="mt-4 space-y-2 border-t border-gray-100 pt-4">
                {entry.commitments.map((commitment) => (
                  <CommitmentLine key={commitment.commitmentId} commitment={commitment} />
                ))}
              </ul>
            ) : null}

            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
              <Link
                href={entry.compassHref}
                className="inline-flex items-center gap-1 text-sm font-semibold text-violet-700 hover:text-violet-900"
              >
                Apri il riepilogo sessione
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              {trend ? <EntryTrend metric={trend.metric} trend={trend.trend} /> : null}
            </div>
          </div>
        </div>
      </article>
    </li>
  );
}

/**
 * L'andamento da mostrare accanto a ogni seduta.
 *
 * Si sceglie la metrica principale di quella seduta e la si guarda nel tempo,
 * fino a quel giorno: è l'unica lettura onesta in una pagina che racconta un
 * percorso. Le metriche di una singola seduta messe in fila non sarebbero una
 * serie storica, e disegnarle come tale sarebbe un grafico che mente.
 */
function trendsByEntry(
  timeline: readonly MentalJourneyEntry[]
): Map<number, { metric: JourneyMetric; trend: MetricTrend }> {
  const chronological = [...timeline].sort(
    (a, b) =>
      Date.parse(a.sessionDate ?? a.approvedAt) - Date.parse(b.sessionDate ?? b.approvedAt)
  );
  const result = new Map<number, { metric: JourneyMetric; trend: MetricTrend }>();

  chronological.forEach((entry, index) => {
    const metric = entry.metrics?.[0];
    if (!metric) return;
    const points = chronological
      .slice(0, index + 1)
      .flatMap((previous) => {
        const value = previous.metrics?.find((item) => item.key === metric.key)?.value;
        return value === undefined ? [] : [{ sessionId: previous.sessionId, value }];
      });
    const trend = buildMetricTrend(points);
    if (trend) result.set(entry.sessionId, { metric, trend });
  });

  return result;
}

/**
 * La cronologia completa delle sedute.
 *
 * Estratta da `MentalJourneyView` per poter vivere dentro la scheda atleta:
 * la pagina «percorso mentale» conteneva tre blocchi duplicati piu' due utili,
 * e questa e' uno dei due. La striscia in cima alla scheda e' una **selezione**
 * — sei tappe al massimo, scelte su tutto l'arco — mentre qui c'e' tutto, in
 * ordine. Sono due domande diverse: «dove siamo arrivati» e «che cosa e'
 * successo, seduta per seduta».
 */
export function JourneyTimelineSection({
  timeline,
}: {
  timeline: readonly MentalJourneyEntry[];
}) {
  if (!timeline.length) return null;
  const trends = trendsByEntry(timeline);

  return (
    <ol className="mt-4 space-y-5 border-l border-violet-100">
      {timeline.map((entry) => (
        <TimelineCard
          key={entry.sessionId}
          entry={entry}
          trend={trends.get(entry.sessionId) ?? null}
        />
      ))}
    </ol>
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

  const trends = trendsByEntry(journey.timeline);

  return (
    <div className="flex flex-col gap-8">
      <SummaryHeader journey={journey} athleteName={athleteName} />

      {/* Affiancati: «da riprendere» è la lista delle intenzioni, «impegni in
          corso» è la realtà. Si leggono confrontandoli. */}
      <div className="grid gap-6 lg:grid-cols-2 [&>*]:h-full">
        <PointsToRevisitSection points={journey.pointsToRevisit} />
        <FollowThroughSection items={journey.followThrough} />
      </div>

      <RecurringThemesSection themes={journey.recurringThemes} />

      <section aria-labelledby="mental-journey-timeline">
        <h2
          id="mental-journey-timeline"
          className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500"
        >
          La storia del percorso
        </h2>
        <ol className="mt-4 space-y-5 border-l border-violet-100">
          {journey.timeline.map((entry) => (
            <TimelineCard
              key={entry.sessionId}
              entry={entry}
              trend={trends.get(entry.sessionId) ?? null}
            />
          ))}
        </ol>
      </section>

      <p className="flex items-start gap-2 text-xs text-gray-500">
        <Compass className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Questa vista è riservata al coach e sola lettura: raccoglie soltanto report già approvati e
        lo stato reale degli impegni. Non contiene valutazioni cliniche.
      </p>
    </div>
  );
}
