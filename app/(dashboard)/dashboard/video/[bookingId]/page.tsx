import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { createRoomToken } from '@/lib/core/video';
import {
  FEATURE_CODES,
  hasFeatureEntitlement,
} from '@/lib/core/features';
import { formatDateTime } from '@/lib/core/format';
import { VideoRoom } from './video-room';
import { StartCallSignal } from './start-call-signal';

export const dynamic = 'force-dynamic';

/**
 * Perché la stanza è chiusa, detto con le parole di quello che è successo.
 * "Pagina non trovata" era tecnicamente il risultato giusto e praticamente
 * inutile: chi arriva qui ha in mano un link legittimo, che semplicemente non
 * serve più, e merita di sapere quale delle tre cose è accaduta.
 */
function closedSessionCopy(status: string): { title: string; body: string } {
  if (status === 'completed') {
    return {
      title: 'Sessione conclusa',
      body: 'Il coach ha chiuso questa sessione, quindi la stanza non è più aperta. Trovi la sessione nel tuo storico, e potete fissarne una nuova quando volete.',
    };
  }
  if (status === 'cancelled') {
    return {
      title: 'Sessione annullata',
      body: 'Questa sessione è stata annullata, quindi la videochiamata non è più disponibile. Se è stato un errore, fissatene una nuova.',
    };
  }
  if (status === 'declined' || status === 'expired') {
    return {
      title: 'Sessione non confermata',
      body: 'Questa richiesta non è mai diventata un appuntamento, quindi non esiste una stanza da aprire. Puoi inviare una nuova richiesta.',
    };
  }
  return {
    title: 'Sessione non disponibile',
    body: 'Questa sessione non è aperta: la videochiamata si attiva solo per un appuntamento confermato.',
  };
}

export default async function VideoPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const id = Number(bookingId);
  const user = await getUser();
  if (!user || !Number.isInteger(id)) {
    notFound();
  }

  const result = await createRoomToken(id, user.id);

  // Not a participant or booking not accepted → behave as not found.
  if (!result.ok && result.reason === 'unauthorized') {
    notFound();
  }

  const canStartAiNotes =
    result.ok &&
    result.viewerIsCoach &&
    (await hasFeatureEntitlement(
      user.id,
      FEATURE_CODES.AI_SESSION_NOTES
    ));
  const { backHref, otherName } = result;

  return (
    <section className="mx-auto w-full max-w-6xl p-6">
      <Link
        href={backHref}
        className="text-sm text-gray-500 hover:text-gray-900"
      >
        ← Torna alla dashboard
      </Link>

      <header className="mt-3">
        <h1 className="text-2xl font-semibold text-gray-900">
          Videochiamata con {otherName}
        </h1>
      </header>

      <div className="mt-6">
        {result.ok ? (
          <>
            {/* Either participant opening the room nudges the other's app with
                an incoming-call popup, so the second to arrive can join
                (best-effort; only if realtime configured). */}
            <StartCallSignal
              bookingId={id}
              counterpartUserId={result.counterpartUserId}
              fromName={result.viewerName}
              serviceTitle={result.serviceTitle}
              scheduledFor={result.scheduledFor}
            />
            <VideoRoom
              serverUrl={result.url}
              token={result.token}
              preflightToken={result.preflightToken}
              bookingId={id}
              viewerIsCoach={result.viewerIsCoach}
              canStartAiNotes={canStartAiNotes}
              coachIdentity={result.coachIdentity}
              backHref={result.backHref}
              counterpartName={otherName}
            />
          </>
        ) : result.reason === 'closed' ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6">
            <p className="text-sm font-semibold text-gray-900">
              {closedSessionCopy(result.status).title}
            </p>
            <p className="mt-1 text-sm text-gray-800">
              {closedSessionCopy(result.status).body}
            </p>
            <Link
              href={result.backHref}
              className="mt-4 inline-flex items-center rounded-full bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Torna alla dashboard
            </Link>
          </div>
        ) : result.reason === 'past' ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6">
            <p className="text-sm font-semibold text-gray-900">
              Sessione scaduta
            </p>
            <p className="mt-1 text-sm text-gray-800">
              Il tempo previsto per questa sessione è passato, quindi la stanza
              non è più aperta. Se serve rivedervi, fissate un nuovo
              appuntamento.
            </p>
            <Link
              href={result.backHref}
              className="mt-4 inline-flex items-center rounded-full bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Torna alla dashboard
            </Link>
          </div>
        ) : result.reason === 'too_early' ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6">
            <p className="text-sm font-semibold text-gray-900">
              Non è ancora ora
            </p>
            <p className="mt-1 text-sm text-gray-800">
              La videochiamata si apre 5 minuti prima dell’orario previsto:{' '}
              {formatDateTime(new Date(result.scheduledFor))}. Torna qui poco
              prima dell’inizio.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6">
            <p className="text-sm font-semibold text-gray-900">
              Videochiamata non configurata
            </p>
            <p className="mt-1 text-sm text-gray-800">
              La videochiamata richiede LiveKit. Imposta{' '}
              <code>LIVEKIT_API_KEY</code>, <code>LIVEKIT_API_SECRET</code> e{' '}
              <code>NEXT_PUBLIC_LIVEKIT_URL</code> nell’ambiente, poi riavvia
              l’app. La chat resta disponibile anche senza video.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
