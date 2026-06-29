import { getUser } from '@/lib/db/queries';
import { getUserRoles } from '@/lib/core/auth';

export async function GET() {
  const user = await getUser();
  if (!user) {
    return Response.json({ roles: [] });
  }
  const roles = await getUserRoles(user.id);
  return Response.json({ roles });
}
