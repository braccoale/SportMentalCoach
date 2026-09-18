import { getApiUser } from '@/lib/auth/api-user';
import { getCourseHeroKey } from '@/lib/core/academy/courses';
import { assertCourseMember } from '@/lib/core/academy/instructors';
import { readAcademyMaterial } from '@/lib/core/storage';

/** Immagine hero del corso — chiave privata, mai un URL pubblico permanente. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { courseId: courseIdRaw } = await params;
  const courseId = Number(courseIdRaw);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return Response.json({ error: 'invalid_id' }, { status: 400 });
  }

  try {
    await assertCourseMember(user.id, courseId);
  } catch {
    return Response.json({ error: 'unauthorized' }, { status: 403 });
  }

  const heroImageKey = await getCourseHeroKey(courseId);
  if (!heroImageKey) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const bytes = await readAcademyMaterial(heroImageKey);
  const extension = heroImageKey.split('.').pop()?.toLowerCase();
  const contentType =
    extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';

  return new Response(bytes, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
