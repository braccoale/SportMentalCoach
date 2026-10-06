import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import {
  formatRomeDateValue,
  formatTime,
  MONTH_LABELS_SHORT,
  WEEKDAY_LABELS,
} from '@/lib/core/format';
import {
  getAdminDaySessions,
  getUpcomingAgenda,
  resolveAgendaDay,
} from '@/lib/core/admin/agenda';
import { romeDayValueToInstant } from '@/lib/core/admin/period';
import { upcomingDayName } from '@/lib/core/admin/upcoming';
import type { TranscriptionOutcomeKind } from '@/lib/core/admin/transcription-outcome';
import type { ParticipantPresence } from '@/lib/core/admin/session-presence';
import { SectionHeader, EmptyBlock } from '@/components/admin/control-room';
import { LiveSessionDot } from '@/components/admin/live-session-dot';
import { RefreshButton } from '@/components/admin/refresh-button';
import { formatCallDuration } from '@/lib/core/admin/call-span';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  accepted: 'Confermata',
  requested: 'Da confermare',
  completed: 'Conclusa',
};

const STATUS_STYLE: Record<string, string> = {
  accepted: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  requested: 'bg-amber-50 text-amber-800 ring-amber-200',
  completed: 'bg-gray-100 text-gray-600 ring-gray-200',
};

const TRANSCRIPTION_STYLE: Record<TranscriptionOutcomeKind, string> = {
  none: 'bg-gray-100 text-gray-600 ring-gray-200',
  waiting: 'bg-gray-100 text-gray-600 ring-gray-200',
  in_progress: 'bg-sky-50 text-sky-700 ring-sky-200',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  summary_failed: 'bg-amber-50 text-amber-800 ring-amber-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
  refused: 'bg-gray-100 text-gray-600 ring-gray-200',
};

/**
 * L'area Sessioni: una giornata alla volta, avanti e indietro.
 *
 * Prima mostrava solo oggi, e la panoramica guardava solo all'indietro:
 * **domani non era una domanda che si potesse fare.** Adesso `?giorno=` apre
 * qualunque data, ed è il bersaglio dei riquadri dell'agenda in panoramica —
 * un numero che dice «domani sono quattro» deve avere quattro righe dietro,
 * altrimenti è un'ansia e non un'informazione.
 *
 * La lettura è per giorno, non l'intera tabella filtrata in memoria: la
 * finestra viene tradotta in istanti prima di arrivare al database, così
 * resta indicizzabile anche quando le prenotazioni saranno decine di
 * migliaia.
 *
 * Lo storico completo con i propri filtri resta fuori, e la pagina lo dice.
 */
export default async function AdminSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ giorno?: string }>;
}) {
  await requireRole('admin');
  const { giorno } = await searchParams;

  const now = new Date();
  const day = resolveAgendaDay(giorno, now);
  const oggi = formatRomeDateValue(now);

  const [sessions, agenda] = await Promise.all([
    getAdminDaySessions(day, now),
    getUpcomingAgenda(now),
  ]);

  const live = sessions.filter((session) => session.isLive).length;
  const isToday = day === oggi;

  return (
    <section className="p-4 lg:p-0">
      <SectionHeader
        title="Sessioni"
        subtitle="Una giornata alla volta, ora di Roma. Le frecce spostano il giorno; i riquadri qui sotto sono i prossimi sette."
        action={
          <Link
            href="/dashboard/admin/video-sessions"
            className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
          >
            <Activity className="h-4 w-4" aria-hidden="true" />
            Registro tecnico videochiamate
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />

      {/* Navigazione della giornata */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <DayStep day={day} step={-1} label="Giorno precedente">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </DayStep>

        <div className="min-w-0 rounded-xl border border-gray-200 bg-white px-4 py-2">
          <p className="text-sm font-semibold text-gray-950">
            {longDayLabel(day, oggi)}
          </p>
          <p className="text-xs text-gray-500">
            {sessions.length === 0
              ? 'nessuna seduta'
              : `${sessions.length} ${sessions.length === 1 ? 'seduta' : 'sedute'}`}
            {live > 0 ? ` · ${live} in corso adesso` : ''}
          </p>
        </div>

        <DayStep day={day} step={1} label="Giorno successivo">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </DayStep>

        {!isToday ? (
          <Link
            href="/dashboard/admin/sessioni"
            className="rounded-full border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Torna a oggi
          </Link>
        ) : null}

        <RefreshButton />
      </div>

      {/* I prossimi sette giorni: la stessa agenda della panoramica, qui come
          navigazione invece che come riepilogo. */}
      <ul className="mt-4 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {agenda.days.map((entry) => {
          const nome = upcomingDayName(entry.offset);
          const selected = entry.day === day;
          return (
            <li key={entry.day}>
              <Link
                href={`/dashboard/admin/sessioni?giorno=${entry.day}`}
                aria-current={selected ? 'page' : undefined}
                className={`flex flex-col items-center rounded-xl border px-2 py-2 text-center transition-colors ${
                  selected
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide">
                  {nome === 'oggi'
                    ? 'Oggi'
                    : nome === 'domani'
                      ? 'Domani'
                      : shortWeekday(entry.day)}
                </span>
                <span
                  className={`text-[11px] ${selected ? 'text-gray-300' : 'text-gray-400'}`}
                >
                  {dayNumber(entry.day)}
                </span>
                <span className="mt-0.5 text-base font-bold tabular-nums">
                  {entry.totale}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Sedute nel giorno" value={sessions.length} />
        <Tile label="In corso adesso" value={live} tone={live > 0} />
        <Tile
          label="Da confermare"
          value={sessions.filter((s) => s.status === 'requested').length}
        />
        <Tile
          label="Concluse"
          value={sessions.filter((s) => s.status === 'completed').length}
        />
      </div>

      <div className="mt-6">
        {sessions.length === 0 ? (
          <EmptyBlock
            title={`Nessuna seduta ${longDayLabel(day, oggi).toLowerCase()}`}
            detail={
              day > oggi
                ? 'Il calendario di quel giorno è ancora vuoto. Le sedute compaiono qui appena vengono richieste o confermate.'
                : 'Quel giorno non ha avuto sedute richieste, confermate o concluse.'
            }
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              {/* Sette colonne invece di dieci, perché stiano tutte senza scorrere:
                  durata sotto l'orario, tempo in call sotto inizio e fine, e la
                  trascrizione AI in una colonna sola (se c'è un esito, vuol
                  dire che l'AI era attiva). Nomi e servizio si troncano con
                  l'etichetta completa al passaggio del mouse. */}
              <table className="w-full text-left text-[13px]">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th scope="col" className="px-3 py-2.5">Orario</th>
                    <th scope="col" className="px-3 py-2.5">Coach</th>
                    <th scope="col" className="px-3 py-2.5">Atleta</th>
                    <th scope="col" className="px-3 py-2.5">Servizio</th>
                    <th scope="col" className="px-3 py-2.5">Call</th>
                    <th scope="col" className="px-3 py-2.5">Stato</th>
                    <th scope="col" className="px-3 py-2.5">Trascrizione AI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sessions.map((session) => (
                    <tr key={session.bookingId} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                        <span className="block font-semibold text-gray-950">
                          {formatTime(session.scheduledFor)}
                        </span>
                        <span className="block text-xs text-gray-500">
                          {session.durationMin ? `${session.durationMin}′` : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <PersonCell
                          name={session.coachName}
                          presence={session.coach}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <PersonCell
                          name={session.athleteName}
                          presence={session.athlete}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">
                        <span
                          className="block max-w-[9rem] truncate"
                          title={session.serviceTitle ?? 'Sessione KaiPai'}
                        >
                          {session.serviceTitle ?? 'Sessione KaiPai'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                        {session.call.startedAt ? (
                          <>
                            <span className="block text-gray-800">
                              {formatTime(session.call.startedAt)}
                              <span className="text-gray-400"> – </span>
                              {session.call.endedAt ? (
                                formatTime(session.call.endedAt)
                              ) : session.call.inProgress ? (
                                <span className="text-emerald-700">in corso</span>
                              ) : (
                                '—'
                              )}
                            </span>
                            <span className="block text-xs text-gray-500">
                              {session.call.durationMin != null
                                ? formatCallDuration(session.call.durationMin)
                                : '—'}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <span
                            className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                              STATUS_STYLE[session.status] ??
                              'bg-gray-100 text-gray-600 ring-gray-200'
                            }`}
                          >
                            {STATUS_LABEL[session.status] ?? session.status}
                          </span>
                          {session.isLive ? <LiveSessionDot /> : null}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {session.transcription.kind !== 'none' ? (
                          <span
                            className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                              TRANSCRIPTION_STYLE[session.transcription.kind]
                            }`}
                          >
                            {session.transcription.label}
                          </span>
                        ) : session.aiTranscriptionActivated ? (
                          <span className="inline-flex whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                            Attivata
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {sessions.length > 0 ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-600">
          <span>
            <span className="font-semibold text-emerald-700">Nome in verde</span>
            : è entrato in sessione
          </span>
          <span className="inline-flex items-center gap-1">
            <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            ha accettato la trascrizione AI
          </span>
          <span className="inline-flex items-center gap-1">
            <X className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
            l’ha rifiutata o revocata
          </span>
        </p>
      ) : null}

      <p className="mt-4 text-xs text-gray-500">
        Lo storico completo delle prenotazioni non è in questa pagina: richiede
        una tabella paginata con i propri filtri, ed è dichiarato fuori ambito
        invece di essere costruito a metà. Per l’andamento nel tempo c’è il
        grafico in{' '}
        <Link href="/dashboard/admin" className="text-red-600 hover:underline">
          Panoramica
        </Link>
        , con il periodo a 12 mesi per confrontare i mesi fra loro.
      </p>
    </section>
  );
}

/** Il giorno spostato di uno, come collegamento: niente stato nel browser. */
function DayStep({
  day,
  step,
  label,
  children,
}: {
  day: string;
  step: number;
  label: string;
  children: React.ReactNode;
}) {
  const instant = romeDayValueToInstant(day);
  if (!instant) return null;
  // Mezzogiorno prima di spostarsi: sommare ventiquattro ore a mezzanotte
  // sbaglia di un giorno nelle due notti del cambio d'ora.
  const target = new Date(
    instant.getTime() + 12 * 3_600_000 + step * 24 * 3_600_000
  );

  return (
    <Link
      href={`/dashboard/admin/sessioni?giorno=${formatRomeDateValue(target)}`}
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
    >
      {children}
    </Link>
  );
}

function dayNumber(day: string): string {
  const [, month, dayOfMonth] = day.split('-');
  return `${Number(dayOfMonth)} ${MONTH_LABELS_SHORT[Number(month) - 1] ?? ''}`;
}

function shortWeekday(day: string): string {
  const instant = romeDayValueToInstant(day);
  if (!instant) return '';
  const midday = new Date(instant.getTime() + 12 * 3_600_000);
  return WEEKDAY_LABELS[midday.getUTCDay()].slice(0, 3);
}

function longDayLabel(day: string, today: string): string {
  if (day === today) return 'Oggi';
  const instant = romeDayValueToInstant(day);
  if (!instant) return day;
  const midday = new Date(instant.getTime() + 12 * 3_600_000);
  return `${WEEKDAY_LABELS[midday.getUTCDay()]} ${dayNumber(day)}`;
}

function Tile({
  label,
  value,
  tone = false,
}: {
  label: string;
  value: number;
  tone?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-4 ${
        tone ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-gray-950">
        {value}
      </p>
    </div>
  );
}

/**
 * Il nome di una persona con ciò che si sa di lei in quella seduta: in verde se
 * è entrata, con una spunta se ha accettato la trascrizione AI e una croce se
 * l'ha rifiutata o revocata. Il colore non è l'unico segnale: ogni stato ha
 * anche un testo per chi usa uno screen reader e un'etichetta al passaggio del
 * mouse.
 */
function PersonCell({
  name,
  presence,
}: {
  name: string;
  presence: ParticipantPresence;
}) {
  return (
    <span className="inline-flex max-w-[11rem] items-center gap-1.5 whitespace-nowrap">
      <span
        className={`truncate ${
          presence.joined ? 'font-semibold text-emerald-700' : 'text-gray-800'
        }`}
        title={presence.joined ? `${name} · è entrato in sessione` : name}
      >
        {name}
      </span>
      {presence.joined ? <span className="sr-only">(è entrato in sessione)</span> : null}
      {presence.consent === 'accepted' ? (
        <span
          className="inline-flex"
          title="Ha accettato la trascrizione AI"
        >
          <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <span className="sr-only">ha accettato la trascrizione AI</span>
        </span>
      ) : null}
      {presence.consent === 'declined' ? (
        <span
          className="inline-flex"
          title="Ha rifiutato o revocato la trascrizione AI"
        >
          <X className="h-4 w-4 text-red-600" aria-hidden="true" />
          <span className="sr-only">ha rifiutato o revocato la trascrizione AI</span>
        </span>
      ) : null}
    </span>
  );
}
