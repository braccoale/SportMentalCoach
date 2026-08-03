import 'server-only';
import { getUser } from '@/lib/db/queries';
import {
  MentalJourneyError,
  getMentalJourney,
} from '@/lib/core/ai-session-notes/mental-journey';
import { mentalJourneyDependencies } from '@/lib/core/ai-session-notes/mental-journey-store';

export const dynamic = 'force-dynamic';

/** Proiezione read-only del percorso. Riservata al coach titolare e all'admin. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ athleteId: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ code: 'UNAUTHENTICATED', error: 'Non autenticato.' }, { status: 401 });
  }
  const athleteUserId = Number((await params).athleteId);
  if (!Number.isInteger(athleteUserId) || athleteUserId <= 0) {
    return Response.json({ code: 'INVALID_ATHLETE', error: 'Atleta non valido.' }, { status: 400 });
  }

  try {
    const journey = await getMentalJourney(
      { athleteUserId, actorUserId: user.id },
      mentalJourneyDependencies()
    );
    return Response.json({ journey });
  } catch (error) {
    if (!(error instanceof MentalJourneyError)) {
      return Response.json(
        { code: 'MENTAL_JOURNEY_FAILED', error: 'Non è stato possibile caricare il percorso.' },
        { status: 500 }
      );
    }
    return Response.json(
      { code: error.code, error: error.message },
      { status: statusFor(error.code) }
    );
  }
}

function statusFor(code: MentalJourneyError['code']): number {
  if (code === 'UNAUTHORIZED') return 401;
  if (code === 'INVALID_ATHLETE') return 400;
  return 403;
}
