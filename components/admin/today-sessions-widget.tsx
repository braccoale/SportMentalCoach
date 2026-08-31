import { CalendarClock, ChevronRight } from 'lucide-react';
import { LiveSessionDot } from '@/components/admin/live-session-dot';
import { formatTime } from '@/lib/core/format';
import { sessionEndsAt } from '@/lib/core/sessions';
import type { AdminTodaySession } from '@/lib/core/admin/today-sessions';

const STATUS_LABEL: Record<string, string> = {
  accepted: 'Confermata',
  requested: 'Da confermare',
  completed: 'Svolta',
};

const STATUS_TONE: Record<string, string> = {
  accepted: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  requested: 'bg-amber-50 text-amber-800 ring-amber-200',
  completed: 'bg-gray-100 text-gray-600 ring-gray-200',
};

/**
 * Il quarto riquadro: quante sessioni ci sono oggi, e cliccandolo quali.
 *
 * È il riquadro stesso a essere il pulsante — non un numero accanto a un link
 * che porta altrove: la domanda «cosa succede oggi» e la risposta stanno nello
 * stesso posto. Chiuso occupa una cella come gli altri tre; aperto si prende
 * tutta la riga (`open:col-span-full`), perché un elenco di orari, coach e
 * atleti dentro un terzo di riga non si legge.
 *
 * `<details>` nativo: nessuno stato React, nessun JavaScript, tastiera e
 * accessibilità già gestite dal browser. Non ricorda l'apertura di proposito —
 * è un riquadro che si guarda adesso, non un pannello di lavoro.
 *
 * Gli orari sono quelli di Roma, come ovunque nel prodotto: `formatTime` fissa
 * il fuso, così l'ora non cambia con il computer di chi guarda.
 */
export function TodaySessionsWidget({
  sessions,
}: {
  sessions: AdminTodaySession[];
}) {
  const liveCount = sessions.filter((session) => session.isLive).length;
  const first = sessions[0];
  const last = sessions[sessions.length - 1];

  const hint =
    liveCount > 0
      ? `${liveCount} in corso adesso`
      : first
        ? `dalle ${formatTime(first.scheduledFor)} alle ${formatTime(
            sessionEndsAt(last.scheduledFor, last.durationMin)
          )}`
        : 'niente in agenda';

  return (
    <details className="group rounded-xl border border-gray-200 bg-white open:col-span-2 open:shadow-sm sm:open:col-span-4">
      <summary className="flex cursor-pointer list-none flex-col p-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2 text-gray-500">
          <CalendarClock className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">
            Sessioni di oggi
          </span>
          <ChevronRight
            aria-hidden="true"
            className="ml-auto size-4 text-gray-400 transition-transform group-open:rotate-90"
          />
        </div>
        <p className="mt-1 flex items-baseline gap-2 text-2xl font-bold text-gray-900">
          {sessions.length}
          <span className="text-xs font-medium text-gray-500">{hint}</span>
        </p>
      </summary>

      <div className="border-t border-gray-200 p-4">
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nessuna sessione in programma oggi. Compaiono qui appena un atleta
            prenota o un coach fissa un appuntamento.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => (
              <li
                key={session.bookingId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-200"
              >
                <span className="font-mono text-sm font-semibold tabular-nums text-gray-900">
                  {formatTime(session.scheduledFor)}–
                  {formatTime(
                    sessionEndsAt(session.scheduledFor, session.durationMin)
                  )}
                </span>
                {/* Il nome del coach porta alla sua riga più in basso nella
                    pagina: da «chi è in sessione adesso» si arriva in un click
                    al profilo da verificare. */}
                <a
                  href={`#coach-${session.coachProviderId}`}
                  className="text-sm font-medium text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-900"
                >
                  {session.coachName}
                </a>
                <span aria-hidden="true" className="text-gray-300">
                  ·
                </span>
                <span className="text-sm text-gray-700">
                  {session.athleteName}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                    STATUS_TONE[session.status] ??
                    'bg-gray-100 text-gray-600 ring-gray-200'
                  }`}
                >
                  {STATUS_LABEL[session.status] ?? session.status}
                </span>
                {session.isLive ? <LiveSessionDot /> : null}
                <span className="ml-auto text-xs text-gray-500">
                  {session.serviceTitle ?? 'Sessione'}
                  {session.durationMin ? ` · ${session.durationMin} min` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
