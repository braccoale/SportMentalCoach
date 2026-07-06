import { getUser } from '@/lib/db/queries';
import { recordSessionHeartbeat } from '@/lib/core/video';

/**
 * Called periodically by a connected call participant to track the real
 * session duration. Auth + participant check happen in recordSessionHeartbeat.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const id = Number(bookingId);
  const user = await getUser();
  if (!user || !Number.isInteger(id)) {
    return new Response(null, { status: 401 });
  }
  const ok = await recordSessionHeartbeat(id, user.id);
  return Response.json({ ok });
}
