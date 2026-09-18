import { getApiUser } from '@/lib/auth/api-user';
import { getRecapForPdf } from '@/lib/core/academy/recap/service';
import { buildAcademyRecapPdf, academyRecapPdfFileName } from '@/lib/core/academy/recap/pdf';
import { sessionPdfDownloadHeaders } from '@/lib/core/ai-session-notes/session-pdf';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const id = Number(sessionId);
  const user = await getApiUser(request);
  if (!user || !Number.isInteger(id)) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let data;
  try {
    data = await getRecapForPdf(user.id, id);
  } catch (error) {
    const status = error instanceof Error && error.message === 'FORBIDDEN' ? 403 : 404;
    return Response.json({ error: 'not_found' }, { status });
  }
  if (!data || !data.recap.content) {
    return Response.json({ error: 'no_recap' }, { status: 404 });
  }

  const bytes = await buildAcademyRecapPdf({
    courseTitle: data.courseTitle,
    moduleTitle: data.moduleTitle,
    sessionDate: data.scheduledFor,
    instructorName: data.instructorName,
    generatedAt: data.recap.generatedAt ?? data.recap.editedAt ?? new Date(),
    recap: data.recap.content,
  });

  const fileName = academyRecapPdfFileName(data.moduleTitle, data.scheduledFor);
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: sessionPdfDownloadHeaders(fileName),
  });
}
