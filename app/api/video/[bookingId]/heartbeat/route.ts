import { getApiUser } from '@/lib/auth/api-user';
import { recordSessionHeartbeat } from '@/lib/core/video';

/**
 * Called periodically by a connected call participant to track the real
 * session duration. Auth + participant check happen in recordSessionHeartbeat.
 *
 * Riconosce sia il cookie del browser sia il token dell'app: il battito
 * arrivava solo dal web, e una seduta tenuta dal telefono non lasciava traccia
 * ne' della sua durata ne' del fatto di essere in corso.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const id = Number(bookingId);
  const user = await getApiUser(request);
  if (!user || !Number.isInteger(id)) {
    return new Response(null, { status: 401 });
  }
  const ok = await recordSessionHeartbeat(id, user.id);
  return Response.json({ ok });
}
