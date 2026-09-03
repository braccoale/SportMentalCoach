import Link from 'next/link';
import { Activity, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { SectionHeader, EmptyBlock } from '@/components/admin/control-room';
import { LiveSessionDot } from '@/components/admin/live-session-dot';

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
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">Orario</th>
                    <th scope="col" className="px-4 py-3">Coach</th>
                    <th scope="col" className="px-4 py-3">Atleta</th>
                    <th scope="col" className="px-4 py-3">Servizio</th>
                    <th scope="col" className="px-4 py-3">Durata</th>
                    <th scope="col" className="px-4 py-3">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sessions.map((session) => (
                    <tr key={session.bookingId}>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-gray-950">
                        {formatTime(session.scheduledFor)}
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {session.coachName}
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {session.athleteName}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {session.serviceTitle ?? 'Sessione KaiPai'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-600">
                        {session.durationMin ? `${session.durationMin}′` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                              STATUS_STYLE[session.status] ??
                              'bg-gray-100 text-gray-600 ring-gray-200'
                            }`}
                          >
                            {STATUS_LABEL[session.status] ?? session.status}
                          </span>
                          {session.isLive ? <LiveSessionDot /> : null}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

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
