import { requireRole } from '@/lib/core/auth';
import { getMaterialForDownload } from '@/lib/core/academy/materials';
import { readAcademyMaterial } from '@/lib/core/storage';

/**
 * Scarica un materiale Academy. Solo admin in questa fase: la vista
 * docente/partecipante (Task 8) non esiste ancora, quindi non c'è nessun
 * altro percorso autorizzato da servire.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  await requireRole('admin');
  const { attachmentId: attachmentIdRaw } = await params;
  const attachmentId = Number(attachmentIdRaw);
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    return Response.json({ error: 'invalid_id' }, { status: 400 });
  }

  const attachment = await getMaterialForDownload(attachmentId);
  if (!attachment) {
    return Response.json({ error: 'not_found' }, { status: 404 });
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
