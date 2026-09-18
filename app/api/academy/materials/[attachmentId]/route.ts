import { getApiUser } from '@/lib/auth/api-user';
import { getMaterialForDownload } from '@/lib/core/academy/materials';
import { assertCourseMember, isInstructorOrAdminBool } from '@/lib/core/academy/instructors';
import { readAcademyMaterial } from '@/lib/core/storage';

/**
 * Scarica un materiale Academy — admin, docente del corso o partecipante
 * assegnato. Un partecipante non può scaricare una bozza, anche conoscendo
 * l'id: stessa regola di `listMaterials`, applicata di nuovo qui perché
 * l'id è raggiungibile per URL diretto, non solo dalla lista filtrata.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { attachmentId: attachmentIdRaw } = await params;
  const attachmentId = Number(attachmentIdRaw);
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    return Response.json({ error: 'invalid_id' }, { status: 400 });
  }

  const attachment = await getMaterialForDownload(attachmentId);
  if (!attachment) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    await assertCourseMember(user.id, attachment.courseId);
  } catch {
    return Response.json({ error: 'unauthorized' }, { status: 403 });
  }
  if (!attachment.published && !(await isInstructorOrAdminBool(user.id, attachment.courseId))) {
    return Response.json({ error: 'unauthorized' }, { status: 403 });
  }

  const bytes = await readAcademyMaterial(attachment.storageKey);
  return new Response(bytes, {
    headers: {
      'Content-Type': attachment.contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
