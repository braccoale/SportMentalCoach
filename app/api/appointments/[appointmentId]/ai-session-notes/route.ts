import { getUser } from '@/lib/db/queries';
import { getAiNotesSessionForBooking } from '@/lib/core/ai-session-notes';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: 'Non autenticato.' }, { status: 401 });
  }
  const bookingId = Number((await params).appointmentId);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return Response.json({ error: 'Appuntamento non valido.' }, { status: 400 });
  }

  const session = await getAiNotesSessionForBooking(bookingId, user.id);
  // Participant mismatch and a missing booking are intentionally indistinguishable.
  if (!session) {
    return Response.json({ session: null });
  }
  return Response.json({ session });
}
