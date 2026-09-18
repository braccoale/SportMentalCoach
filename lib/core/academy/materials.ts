import 'server-only';
import crypto from 'crypto';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  academyCourseModules,
  academyModuleAttachments,
  type AcademyModuleAttachment,
} from '@/lib/db/schema';
import { assertCourseMember, assertInstructorOrAdmin, isInstructorOrAdminBool } from './instructors';
import {
  ACADEMY_MATERIAL_ALLOWED_MIME_TYPES,
  ACADEMY_MATERIAL_MAX_BYTES,
  deleteAcademyMaterial,
  storeAcademyMaterial,
} from '@/lib/core/storage';

export type ModuleMaterial = {
  id: number;
  title: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  published: boolean;
};

/**
 * Un partecipante vede solo i materiali pubblicati; admin e docente vedono
 * anche le bozze. Stesso corso di autorizzazione di `assertCourseMember`,
 * ma qui il filtro è sul contenuto restituito, non sull'accesso alla
 * funzione — un partecipante può leggere la lista, solo con meno righe.
 */
export async function listMaterials(
  actorUserId: number,
  courseId: number,
  moduleId: number
): Promise<ModuleMaterial[]> {
  await assertCourseMember(actorUserId, courseId);
  const canSeeDrafts = await isInstructorOrAdminBool(actorUserId, courseId);

  const rows = await db
    .select({
      id: academyModuleAttachments.id,
      title: academyModuleAttachments.title,
      fileName: academyModuleAttachments.fileName,
      contentType: academyModuleAttachments.contentType,
      fileSizeBytes: academyModuleAttachments.fileSizeBytes,
      publishedAt: academyModuleAttachments.publishedAt,
    })
    .from(academyModuleAttachments)
    .where(eq(academyModuleAttachments.moduleId, moduleId))
    .orderBy(asc(academyModuleAttachments.sortOrder), asc(academyModuleAttachments.id));
  return rows
    .filter((row) => canSeeDrafts || row.publishedAt !== null)
    .map((row) => ({
      id: row.id,
      title: row.title,
      fileName: row.fileName,
      contentType: row.contentType,
      fileSizeBytes: row.fileSizeBytes,
      published: row.publishedAt !== null,
    }));
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(-120);
}

/**
 * Carica un materiale per un modulo — pubblicato subito (semplice finché
 * non serve davvero una bozza intermedia: admin e docenti del corso possono
 * già nasconderlo con `setMaterialPublished`). Il tipo e la dimensione sono
 * validati qui, non ci si fida del `contentType` dichiarato dal browser da
 * solo: è comunque quello che arriva, ma il bucket stesso ha lo stesso
 * whitelist come seconda barriera.
 */
export async function uploadMaterial(params: {
  actorUserId: number;
  courseId: number;
  moduleId: number;
  title: string;
  fileName: string;
  contentType: string;
  bytes: Buffer;
}): Promise<AcademyModuleAttachment> {
  await assertInstructorOrAdmin(params.actorUserId, params.courseId);

  if (params.bytes.byteLength === 0) {
    throw new Error('Il file è vuoto.');
  }
  if (params.bytes.byteLength > ACADEMY_MATERIAL_MAX_BYTES) {
    const maxMb = Math.floor(ACADEMY_MATERIAL_MAX_BYTES / (1024 * 1024));
    throw new Error(`Il file supera il limite di ${maxMb} MB.`);
  }
  if (!ACADEMY_MATERIAL_ALLOWED_MIME_TYPES.includes(params.contentType)) {
    throw new Error('Tipo di file non consentito. Usa PDF, Word, PowerPoint, immagine o video.');
  }

  const storageKey = `academy/modules/${params.moduleId}/${crypto.randomUUID()}-${sanitizeFileName(params.fileName)}`;
  await storeAcademyMaterial(storageKey, params.bytes, params.contentType);

  const now = new Date();
  const [created] = await db
    .insert(academyModuleAttachments)
    .values({
      moduleId: params.moduleId,
      title: params.title,
      fileName: params.fileName,
      storageKey,
      contentType: params.contentType,
      fileSizeBytes: params.bytes.byteLength,
      publishedAt: now,
      publishedBy: params.actorUserId,
      createdBy: params.actorUserId,
    })
    .returning();
  return created;
}

export async function setMaterialPublished(params: {
  actorUserId: number;
  courseId: number;
  attachmentId: number;
  published: boolean;
}): Promise<void> {
  await assertInstructorOrAdmin(params.actorUserId, params.courseId);
  await db
    .update(academyModuleAttachments)
    .set(
      params.published
        ? { publishedAt: new Date(), publishedBy: params.actorUserId }
        : { publishedAt: null, publishedBy: null }
    )
    .where(eq(academyModuleAttachments.id, params.attachmentId));
}

export async function deleteMaterial(params: {
  actorUserId: number;
  courseId: number;
  attachmentId: number;
}): Promise<void> {
  await assertInstructorOrAdmin(params.actorUserId, params.courseId);
  const [attachment] = await db
    .select({ storageKey: academyModuleAttachments.storageKey })
    .from(academyModuleAttachments)
    .where(eq(academyModuleAttachments.id, params.attachmentId))
    .limit(1);
  if (!attachment) return;

  await db.delete(academyModuleAttachments).where(eq(academyModuleAttachments.id, params.attachmentId));
  await deleteAcademyMaterial(attachment.storageKey);
}

/**
 * Include `courseId` e `published` perché la route di download deve
 * autorizzare per corso (admin/docente/partecipante) e, per il solo
 * partecipante, rifiutare una bozza — la stessa regola applicata in
 * `listMaterials`, qui a livello di singolo file.
 */
export async function getMaterialForDownload(attachmentId: number): Promise<{
  courseId: number;
  storageKey: string;
  fileName: string;
  contentType: string;
  published: boolean;
} | null> {
  const [attachment] = await db
    .select({
      courseId: academyCourseModules.courseId,
      storageKey: academyModuleAttachments.storageKey,
      fileName: academyModuleAttachments.fileName,
      contentType: academyModuleAttachments.contentType,
      publishedAt: academyModuleAttachments.publishedAt,
    })
    .from(academyModuleAttachments)
    .innerJoin(academyCourseModules, eq(academyCourseModules.id, academyModuleAttachments.moduleId))
    .where(eq(academyModuleAttachments.id, attachmentId))
    .limit(1);
  if (!attachment) return null;
  return {
    courseId: attachment.courseId,
    storageKey: attachment.storageKey,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    published: attachment.publishedAt !== null,
  };
}
