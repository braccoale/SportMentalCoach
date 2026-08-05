import { getSessionUser } from '@/lib/db/queries';

export async function GET() {
  const user = await getSessionUser();
  return Response.json(user);
}
