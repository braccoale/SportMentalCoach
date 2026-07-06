import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { createRoomToken } from '@/lib/core/video';
import { VideoRoom } from './video-room';
import { StartCallSignal } from './start-call-signal';

export const dynamic = 'force-dynamic';

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
              bookingId={id}
            />
          </>
        ) : result.reason === 'past' ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6">
            <p className="text-sm font-semibold text-gray-900">
              Sessione terminata
            </p>
            <p className="mt-1 text-sm text-gray-800">
              Non è possibile avviare una videochiamata per una sessione già
              trascorsa. Se hai bisogno di un nuovo incontro, prenota un’altra
              sessione.
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
