import Link from 'next/link';
import { Activity, ArrowRight } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { getAdminBookingsOverview } from '@/lib/core/admin';
import { formatTime } from '@/lib/core/format';
import {
  SectionHeader,
  EmptyBlock,
} from '@/components/admin/control-room';
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
 * L'area Sessioni: la giornata, e il registro tecnico delle videochiamate.
 *
 * La giornata è quella di Roma, decisa da `buildTodaySessions`, che è già
 * provato: qui si disegna soltanto. La finestra è deliberatamente stretta —
 * oggi — perché è la domanda che si fa chi apre questa pagina: chi vede chi,
 * adesso, e c'è qualcuno collegato.
 *
 * Lo storico completo delle prenotazioni resta fuori: è un elenco enorme che
 * richiede una tabella paginata con i suoi filtri, ed è dichiarato fuori
 * ambito invece di essere costruito a metà.
 */
export default async function AdminSessionsPage() {
  await requireRole('admin');
  const { todaySessions } = await getAdminBookingsOverview();

  const live = todaySessions.filter((session) => session.isLive).length;

  return (
    <section className="p-4 lg:p-0">
      <SectionHeader
        title="Sessioni"
        subtitle="La giornata di oggi, ora di Roma: chi vede chi, e chi è collegato in questo momento."
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

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Sedute oggi" value={todaySessions.length} />
        <Tile label="In corso adesso" value={live} tone={live > 0} />
        <Tile
          label="Da confermare"
          value={todaySessions.filter((s) => s.status === 'requested').length}
        />
        <Tile
          label="Concluse"
          value={todaySessions.filter((s) => s.status === 'completed').length}
        />
      </div>

      <div className="mt-6">
        {todaySessions.length === 0 ? (
          <EmptyBlock
            title="Nessuna seduta oggi"
            detail="Non c’è niente in agenda per la giornata di oggi. Le sedute compaiono qui appena vengono richieste o confermate."
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
                  {todaySessions.map((session) => (
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
        invece di essere costruito a metà.
      </p>
    </section>
  );
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
