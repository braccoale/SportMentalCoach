import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { createAcademyRoomToken } from '@/lib/core/video/academy';
import { getRecordingState } from '@/lib/core/academy/recording/service';
import { formatDateTime } from '@/lib/core/format';
import { VideoRoom } from './video-room';
import type { AcademyRecordingControlStatus } from '@/components/academy/academy-recording-consent-control';

function recordingControlStatus(
  status: string | undefined
): AcademyRecordingControlStatus {
  if (
    status === 'recording' ||
    status === 'processing' ||
    status === 'ready' ||
    status === 'failed' ||
    status === 'cancelled'
  ) {
    return status;
  }
  if (status === 'consent_rejected') return 'declined';
  return 'undecided';
}

export const dynamic = 'force-dynamic';

function closedSessionCopy(status: string): { title: string; body: string } {
  if (status === 'completed') {
    return {
      title: 'Sessione conclusa',
      body: 'Il docente ha chiuso questa sessione, quindi la stanza non è più aperta. La trovi nello storico del corso.',
    };
  }
  if (status === 'cancelled') {
    return {
      title: 'Sessione annullata',
      body: 'Questa sessione Academy è stata annullata, quindi la videochiamata non è più disponibile.',
    };
  }
  return {
    title: 'Sessione non disponibile',
    body: 'Questa sessione non è aperta.',
  };
}

export default async function AcademyVideoPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const id = Number(sessionId);
  const user = await getUser();
  if (!user || !Number.isInteger(id)) {
    notFound();
  }

  const result = await createAcademyRoomToken(id, user.id);

  if (!result.ok && result.reason === 'unauthorized') {
    notFound();
  }

  const recordingState = result.ok ? await getRecordingState(id) : null;

  return (
    <section className="mx-auto w-full max-w-6xl p-6">
      <Link href="/dashboard/coach" className="text-sm text-gray-500 hover:text-gray-900">
        ← Torna alla dashboard
      </Link>

      <header className="mt-3">
        <h1 className="text-2xl font-semibold text-gray-900">
          {result.ok ? `${result.moduleTitle} — ${result.courseTitle}` : 'Sessione Academy'}
        </h1>
      </header>

      <div className="mt-6">
        {result.ok ? (
          <VideoRoom
            serverUrl={result.url}
            token={result.token}
            preflightToken={result.preflightToken}
            sessionId={id}
            courseId={result.courseId}
            viewerIsInstructor={result.viewerIsInstructor}
            instructorIdentity={result.instructorIdentity}
            instructorName={result.instructorName}
            participantNames={result.participantNames}
            backHref={result.backHref}
            initialRecordingStatus={recordingControlStatus(recordingState?.status)}
          />
        ) : result.reason === 'closed' ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6">
            <p className="text-sm font-semibold text-gray-900">{closedSessionCopy(result.status).title}</p>
            <p className="mt-1 text-sm text-gray-800">{closedSessionCopy(result.status).body}</p>
            <Link
              href={result.backHref}
              className="mt-4 inline-flex items-center rounded-full bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Torna alla dashboard
            </Link>
          </div>
        ) : result.reason === 'past' ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6">
            <p className="text-sm font-semibold text-gray-900">Sessione scaduta</p>
            <p className="mt-1 text-sm text-gray-800">
              Il tempo previsto per questa sessione è passato, quindi la stanza non è più aperta.
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
            <p className="text-sm font-semibold text-gray-900">Non è ancora ora</p>
            <p className="mt-1 text-sm text-gray-800">
              La videochiamata si apre 5 minuti prima dell'orario previsto:{' '}
              {formatDateTime(new Date(result.scheduledFor))}. Torna qui poco prima dell'inizio.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6">
            <p className="text-sm font-semibold text-gray-900">Videochiamata non configurata</p>
            <p className="mt-1 text-sm text-gray-800">
              La videochiamata richiede LiveKit. Imposta <code>LIVEKIT_API_KEY</code>,{' '}
              <code>LIVEKIT_API_SECRET</code> e <code>NEXT_PUBLIC_LIVEKIT_URL</code> nell'ambiente.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
