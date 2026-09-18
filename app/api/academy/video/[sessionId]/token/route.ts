import { getApiUser } from '@/lib/auth/api-user';
import { createAcademyRoomToken } from '@/lib/core/video/academy';

/**
 * Token LiveKit per entrare in una sessione Academy, dall'app — stesso
 * ruolo di `/api/video/[bookingId]/token`, ma delega a
 * `createAcademyRoomToken`, non a `createRoomToken`: le due autorizzazioni
 * non vanno mai confuse.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const id = Number(sessionId);
  const user = await getApiUser(request);
  if (!user || !Number.isInteger(id)) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const result = await createAcademyRoomToken(id, user.id);
  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 403 });
  }

  return Response.json({
    token: result.token,
    url: result.url,
    room: result.room,
    viewerIsInstructor: result.viewerIsInstructor,
    instructorIdentity: result.instructorIdentity,
  });
}
