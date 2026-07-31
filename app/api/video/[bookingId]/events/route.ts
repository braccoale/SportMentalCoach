import { getUser } from '@/lib/db/queries';
import {
  isClientVideoEventType,
} from '@/lib/core/video/technical-events';
import { recordClientVideoEvent } from '@/lib/core/video/technical-events-server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: 'Non autenticato.' }, { status: 401 });
  }

  const bookingId = Number((await params).bookingId);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return Response.json({ error: 'Sessione non valida.' }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Payload non valido.' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return Response.json({ error: 'Payload non valido.' }, { status: 400 });
  }

  const { eventType, details } = payload as {
    eventType?: unknown;
    details?: unknown;
  };
  if (!isClientVideoEventType(eventType)) {
    return Response.json({ error: 'Evento non valido.' }, { status: 400 });
  }

  const recorded = await recordClientVideoEvent(
    bookingId,
    user.id,
    eventType,
    details
  );
  return recorded
    ? new Response(null, { status: 204 })
    : Response.json({ error: 'Non autorizzato.' }, { status: 403 });
}
