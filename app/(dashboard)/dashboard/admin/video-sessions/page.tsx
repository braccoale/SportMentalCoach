import Link from 'next/link';
import { Activity, ArrowLeft, RefreshCw, ShieldCheck } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { formatDateTime } from '@/lib/core/format';
import { getRecentVideoTechnicalEvents } from '@/lib/core/video/technical-events-server';

export const dynamic = 'force-dynamic';

const EVENT_LABELS: Record<string, string> = {
  room_started: 'Stanza avviata',
  room_finished: 'Stanza terminata',
  participant_joined: 'Partecipante connesso',
  participant_left: 'Partecipante uscito',
  participant_connection_aborted: 'Connessione interrotta',
  track_published: 'Traccia pubblicata',
  track_unpublished: 'Traccia rimossa',
  preflight_result: 'Test rete pre-chiamata',
  connection_quality: 'Qualità connessione',
  reconnecting: 'Riconnessione avviata',
  reconnected: 'Riconnesso',
  media_device_error: 'Errore dispositivo',
  waiting_room_entered: 'Ingresso sala d’attesa',
  waiting_room_admitted: 'Ammesso alla chiamata',
  picture_in_picture_started: 'Picture-in-Picture avviato',
  picture_in_picture_stopped: 'Picture-in-Picture terminato',
  krisp_enabled: 'Krisp attivato',
  krisp_disabled: 'Krisp disattivato',
  krisp_error: 'Errore Krisp',
};

function eventTone(eventType: string, details: Record<string, unknown>) {
  if (
    eventType.includes('error') ||
    eventType === 'participant_connection_aborted' ||
    details.quality === 'poor' ||
    details.quality === 'lost' ||
    details.grade === 'poor'
  ) {
    return 'bg-red-50 text-red-700 ring-red-200';
  }
  if (eventType === 'reconnecting' || details.grade === 'warning') {
    return 'bg-amber-50 text-amber-700 ring-amber-200';
  }
  return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
}

export default async function VideoSessionsTechnicalLogPage() {
  await requireRole('admin');
  const events = await getRecentVideoTechnicalEvents();
  const incidents = events.filter(
    (event) =>
      event.eventType.includes('error') ||
      event.eventType === 'participant_connection_aborted' ||
      event.eventType === 'reconnecting' ||
      event.details.quality === 'poor' ||
      event.details.quality === 'lost' ||
      event.details.grade === 'poor'
  ).length;

  return (
    <section className="p-4 lg:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/dashboard/admin/sessioni"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Torna alle sessioni
          </Link>
          <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold text-gray-950">
            <Activity className="h-6 w-6 text-red-600" />
            Registro tecnico videochiamate
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Eventi tecnici minimizzati: nessun nome, token, audio o video viene
            conservato.
          </p>
        </div>
        <Link
          href="/dashboard/admin/video-sessions"
          className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Aggiorna
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-gray-500">
            Eventi mostrati
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-950">
            {events.length}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-gray-500">
            Segnalazioni
          </p>
          <p className="mt-1 text-2xl font-bold text-red-700">{incidents}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-gray-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Privacy
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            Dati tecnici pseudonimizzati
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {events.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">
            Nessun evento video registrato.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Data e ora</th>
                  <th className="px-4 py-3">Sessione</th>
                  <th className="px-4 py-3">Evento</th>
                  <th className="px-4 py-3">Partecipante</th>
                  <th className="px-4 py-3">Origine</th>
                  <th className="px-4 py-3">Dettagli</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map((event) => (
                  <tr key={event.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {formatDateTime(event.occurredAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-950">
                        #{event.bookingId}
                      </p>
                      <p className="text-xs text-gray-500">
                        {event.serviceTitle || 'Sessione KaiPai'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${eventTone(
                          event.eventType,
                          event.details
                        )}`}
                      >
                        {EVENT_LABELS[event.eventType] || event.eventType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {event.participantKind || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {event.source === 'client' ? 'Browser' : 'LiveKit'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {Object.keys(event.details).length > 0
                        ? Object.entries(event.details)
                            .map(([key, value]) => `${key}: ${String(value)}`)
                            .join(' · ')
                        : event.trackSource || event.trackKind || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
