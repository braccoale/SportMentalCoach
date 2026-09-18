import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  academyCourseAssignments,
  academyCourses,
  academyCourseModules,
  academySessions,
  type AcademyCourse,
  type AcademyCourseModule,
  type AcademyCourseStatus,
} from '@/lib/db/schema';
import { assertAdmin } from '@/lib/core/features';
import { courseTotalHours } from './course-hours';
import { assertCourseMember, assertInstructorOrAdmin } from './instructors';
import { deleteAcademyMaterial, storeAcademyMaterial } from '@/lib/core/storage';
import crypto from 'crypto';

const STRUCTURE_LOCKED_MESSAGE =
  'Programma bloccato: crea una nuova edizione per modificarlo.';

export type CourseSummary = {
  id: number;
  title: string;
  description: string | null;
  status: AcademyCourseStatus;
  edition: string | null;
  totalHours: number;
  moduleCount: number;
  structureLocked: boolean;
};

/**
 * Le ore totali si calcolano raggruppando tutti i moduli in memoria e
 * passandoli a `courseTotalHours`, non con una `SUM` SQL: così il numero
 * mostrato in questa lista è calcolato dalla stessa funzione usata dal
 * dettaglio corso, dalla vista del docente/partecipante e dal badge.
 */
export async function listCourses(actorUserId: number): Promise<CourseSummary[]> {
  await assertAdmin(actorUserId);

  const [courses, moduleRows, assignedCourseIds, sessionCourseIds] = await Promise.all([
    db
      .select({
        id: academyCourses.id,
        title: academyCourses.title,
        description: academyCourses.description,
        status: academyCourses.status,
        edition: academyCourses.edition,
      })
      .from(academyCourses)
      .orderBy(academyCourses.id),
    db
      .select({
        courseId: academyCourseModules.courseId,
        hours: academyCourseModules.hours,
      })
      .from(academyCourseModules),
    db.selectDistinct({ courseId: academyCourseAssignments.courseId }).from(academyCourseAssignments),
    db.selectDistinct({ courseId: academySessions.courseId }).from(academySessions),
  ]);

  const modulesByCourseId = new Map<number, { hours: number }[]>();
  for (const row of moduleRows) {
    const list = modulesByCourseId.get(row.courseId);
    if (list) list.push({ hours: row.hours });
    else modulesByCourseId.set(row.courseId, [{ hours: row.hours }]);
  }
  const lockedCourseIds = new Set([
    ...assignedCourseIds.map((r) => r.courseId),
    ...sessionCourseIds.map((r) => r.courseId),
  ]);

  return courses.map((course) => {
    const modules = modulesByCourseId.get(course.id) ?? [];
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      status: course.status as AcademyCourseStatus,
      edition: course.edition,
      totalHours: courseTotalHours(modules),
      moduleCount: modules.length,
      structureLocked: lockedCourseIds.has(course.id),
    };
  });
}

export async function createCourse(params: {
  actorUserId: number;
  title: string;
  description: string | null;
  edition: string | null;
}): Promise<AcademyCourse> {
  await assertAdmin(params.actorUserId);
  const [created] = await db
    .insert(academyCourses)
    .values({
      title: params.title,
      description: params.description,
      edition: params.edition,
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
    })
    .returning();
  return created;
}

/** Titolo e descrizione restano modificabili solo finché il programma non è bloccato. */
export async function updateCourse(params: {
  actorUserId: number;
  courseId: number;
  title: string;
  description: string | null;
  edition: string | null;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await assertStructureUnlocked(params.courseId);

  await db
    .update(academyCourses)
    .set({
      title: params.title,
      description: params.description,
      edition: params.edition,
      updatedDate: new Date(),
      updatedBy: params.actorUserId,
    })
    .where(eq(academyCourses.id, params.courseId));
}

/**
 * Livello e "cosa imparerai" — contenuto della pagina Panoramica, non del
 * programma: modificabile anche a struttura bloccata, a differenza di
 * `updateCourse`.
 */
export async function updateCourseOverview(params: {
  actorUserId: number;
  courseId: number;
  level: string | null;
  whatYoullLearn: string[] | null;
  priceCents: number | null;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  if (params.priceCents !== null && (!Number.isInteger(params.priceCents) || params.priceCents < 0)) {
    throw new Error('Il costo del corso deve essere un numero positivo.');
  }
  await db
    .update(academyCourses)
    .set({
      level: params.level,
      whatYoullLearn: params.whatYoullLearn,
      priceCents: params.priceCents,
      updatedDate: new Date(),
      updatedBy: params.actorUserId,
    })
    .where(eq(academyCourses.id, params.courseId));
}

const ACADEMY_HERO_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACADEMY_HERO_MAX_BYTES = 8 * 1024 * 1024;

/** Carica l'immagine hero del corso, sostituendo quella precedente se c'è. */
export async function uploadCourseHero(params: {
  actorUserId: number;
  courseId: number;
  fileName: string;
  contentType: string;
  bytes: Buffer;
}): Promise<void> {
  await assertAdmin(params.actorUserId);

  if (params.bytes.byteLength === 0) {
    throw new Error('Il file è vuoto.');
  }
  if (params.bytes.byteLength > ACADEMY_HERO_MAX_BYTES) {
    throw new Error('Il file supera il limite di 8 MB.');
  }
  if (!ACADEMY_HERO_ALLOWED_MIME_TYPES.includes(params.contentType)) {
    throw new Error('Tipo di file non consentito. Usa JPEG, PNG o WebP.');
  }

  const [existing] = await db
    .select({ heroImageKey: academyCourses.heroImageKey })
    .from(academyCourses)
    .where(eq(academyCourses.id, params.courseId))
    .limit(1);

  const extension = params.fileName.split('.').pop()?.slice(0, 10) ?? 'jpg';
  const storageKey = `academy/courses/${params.courseId}/hero-${crypto.randomUUID()}.${extension}`;
  await storeAcademyMaterial(storageKey, params.bytes, params.contentType);

  await db
    .update(academyCourses)
    .set({ heroImageKey: storageKey, updatedDate: new Date(), updatedBy: params.actorUserId })
    .where(eq(academyCourses.id, params.courseId));

  if (existing?.heroImageKey) {
    await deleteAcademyMaterial(existing.heroImageKey);
  }
}

/** Per la route di download, dopo che il chiamante ha già verificato l'autorizzazione. */
export async function getCourseHeroKey(courseId: number): Promise<string | null> {
  const [course] = await db
    .select({ heroImageKey: academyCourses.heroImageKey })
    .from(academyCourses)
    .where(eq(academyCourses.id, courseId))
    .limit(1);
  return course?.heroImageKey ?? null;
}

export async function updateCourseStatus(params: {
  actorUserId: number;
  courseId: number;
  status: AcademyCourseStatus;
}): Promise<void> {
  await assertAdmin(params.actorUserId);

  if (params.status === 'active') {
    const [moduleCount] = await db
      .select({ id: academyCourseModules.id })
      .from(academyCourseModules)
      .where(eq(academyCourseModules.courseId, params.courseId))
      .limit(1);
    if (!moduleCount) {
      throw new Error('Un corso senza moduli non può essere attivato.');
    }
  }

  await db
    .update(academyCourses)
    .set({
      status: params.status,
      updatedDate: new Date(),
      updatedBy: params.actorUserId,
    })
    .where(eq(academyCourses.id, params.courseId));
}

export type CourseDetail = {
  id: number;
  title: string;
  description: string | null;
  status: AcademyCourseStatus;
  edition: string | null;
  level: string | null;
  whatYoullLearn: string[] | null;
  priceCents: number | null;
  hasHeroImage: boolean;
  previousCourseId: number | null;
  structureLocked: boolean;
  totalHours: number;
  modules: {
    id: number;
    title: string;
    description: string | null;
    hours: number;
    sortOrder: number;
  }[];
};

/**
 * Letta anche dal coach partecipante, non solo da admin/docente: la pagina
 * Panoramica deve funzionare per tutti e tre i ruoli.
 */
export async function getCourseDetail(
  actorUserId: number,
  courseId: number
): Promise<CourseDetail | null> {
  await assertCourseMember(actorUserId, courseId);

  const [course] = await db
    .select({
      id: academyCourses.id,
      title: academyCourses.title,
      description: academyCourses.description,
      status: academyCourses.status,
      edition: academyCourses.edition,
      level: academyCourses.level,
      whatYoullLearn: academyCourses.whatYoullLearn,
      priceCents: academyCourses.priceCents,
      heroImageKey: academyCourses.heroImageKey,
      previousCourseId: academyCourses.previousCourseId,
    })
    .from(academyCourses)
    .where(eq(academyCourses.id, courseId))
    .limit(1);
  if (!course) return null;

  const [modules, structureLocked] = await Promise.all([
    db
      .select({
        id: academyCourseModules.id,
        title: academyCourseModules.title,
        description: academyCourseModules.description,
        hours: academyCourseModules.hours,
        sortOrder: academyCourseModules.sortOrder,
      })
      .from(academyCourseModules)
      .where(eq(academyCourseModules.courseId, courseId))
      .orderBy(asc(academyCourseModules.sortOrder), asc(academyCourseModules.id)),
    isStructureLocked(courseId),
  ]);

  return {
    id: course.id,
    title: course.title,
    description: course.description,
    status: course.status as AcademyCourseStatus,
    edition: course.edition,
    level: course.level,
    whatYoullLearn: course.whatYoullLearn,
    priceCents: course.priceCents,
    hasHeroImage: course.heroImageKey !== null,
    previousCourseId: course.previousCourseId,
    structureLocked,
    totalHours: courseTotalHours(modules),
    modules,
  };
}

/**
 * Il blocco è deciso dal presente, non da `structureLockedAt`: quella
 * colonna resta scritta la prima volta che qualcuno viene assegnato (solo
 * come informazione storica), ma non è più letta per decidere se il
 * programma è modificabile. Un corso senza nessun coach assegnato e senza
 * nessuna sessione — anche se in passato ne ha avuti e sono stati rimossi
 * — deve poter tornare modificabile: è così che "nessuno collegato" viene
 * interpretato ovunque nell'Academy.
 */
async function isStructureLocked(courseId: number): Promise<boolean> {
  const [assignment] = await db
    .select({ id: academyCourseAssignments.id })
    .from(academyCourseAssignments)
    .where(eq(academyCourseAssignments.courseId, courseId))
    .limit(1);
  if (assignment) return true;
  const [session] = await db
    .select({ id: academySessions.id })
    .from(academySessions)
    .where(eq(academySessions.courseId, courseId))
    .limit(1);
  return Boolean(session);
}

async function assertStructureUnlocked(courseId: number): Promise<void> {
  const [course] = await db
    .select({ id: academyCourses.id })
    .from(academyCourses)
    .where(eq(academyCourses.id, courseId))
    .limit(1);
  if (!course) throw new Error('Corso non trovato.');
  if (await isStructureLocked(courseId)) {
    throw new Error(STRUCTURE_LOCKED_MESSAGE);
  }
}

export async function createModule(params: {
  actorUserId: number;
  courseId: number;
  title: string;
  description: string | null;
  hours: number;
  sortOrder: number;
}): Promise<AcademyCourseModule> {
  await assertAdmin(params.actorUserId);
  if (!Number.isFinite(params.hours) || params.hours < 0) {
    throw new Error('Le ore del modulo devono essere un numero maggiore o uguale a zero.');
  }
  await assertStructureUnlocked(params.courseId);

  const [module] = await db
    .insert(academyCourseModules)
    .values({
      courseId: params.courseId,
      title: params.title,
      description: params.description,
      hours: params.hours,
      sortOrder: params.sortOrder,
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
    })
    .returning();
  return module;
}

export async function updateModule(params: {
  actorUserId: number;
  moduleId: number;
  courseId: number;
  title: string;
  description: string | null;
  hours: number;
  sortOrder: number;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  if (!Number.isFinite(params.hours) || params.hours < 0) {
    throw new Error('Le ore del modulo devono essere un numero maggiore o uguale a zero.');
  }
  await assertStructureUnlocked(params.courseId);

  await db
    .update(academyCourseModules)
    .set({
      title: params.title,
      description: params.description,
      hours: params.hours,
      sortOrder: params.sortOrder,
      updatedDate: new Date(),
      updatedBy: params.actorUserId,
    })
    .where(eq(academyCourseModules.id, params.moduleId));
}

/**
 * Riordina i moduli di un corso secondo l'ordine dato. Ignora qualunque id
 * che non appartenga davvero a questo corso — un client compromesso non può
 * far scivolare il modulo di un altro corso dentro l'ordinamento.
 */
export async function reorderModules(params: {
  actorUserId: number;
  courseId: number;
  orderedModuleIds: number[];
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await assertStructureUnlocked(params.courseId);

  const existing = await db
    .select({ id: academyCourseModules.id })
    .from(academyCourseModules)
    .where(eq(academyCourseModules.courseId, params.courseId));
  const validIds = new Set(existing.map((m) => m.id));
  const orderedValidIds = params.orderedModuleIds.filter((id) => validIds.has(id));

  await db.transaction(async (tx) => {
    await Promise.all(
      orderedValidIds.map((moduleId, index) =>
        tx
          .update(academyCourseModules)
          .set({ sortOrder: index, updatedDate: new Date(), updatedBy: params.actorUserId })
          .where(eq(academyCourseModules.id, moduleId))
      )
    );
  });
}

export async function deleteModule(params: {
  actorUserId: number;
  moduleId: number;
  courseId: number;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await assertStructureUnlocked(params.courseId);

  await db.delete(academyCourseModules).where(eq(academyCourseModules.id, params.moduleId));
}

/**
 * Copia programma e informazioni del corso in una nuova bozza collegata
 * all'edizione precedente. Non copia assegnazioni, docenti, sessioni,
 * materiali, progressi o completamenti — solo titolo, descrizione e moduli,
 * così la nuova edizione riparte davvero da zero sul lato partecipazione.
 */
export async function createNewEdition(params: {
  actorUserId: number;
  courseId: number;
  edition: string | null;
}): Promise<AcademyCourse> {
  await assertAdmin(params.actorUserId);

  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({
        title: academyCourses.title,
        description: academyCourses.description,
      })
      .from(academyCourses)
      .where(eq(academyCourses.id, params.courseId))
      .limit(1);
    if (!source) throw new Error('Corso non trovato.');

    const sourceModules = await tx
      .select({
        title: academyCourseModules.title,
        description: academyCourseModules.description,
        hours: academyCourseModules.hours,
        sortOrder: academyCourseModules.sortOrder,
      })
      .from(academyCourseModules)
      .where(eq(academyCourseModules.courseId, params.courseId))
      .orderBy(asc(academyCourseModules.sortOrder), asc(academyCourseModules.id));

    const [created] = await tx
      .insert(academyCourses)
      .values({
        title: source.title,
        description: source.description,
        edition: params.edition,
        previousCourseId: params.courseId,
        createdBy: params.actorUserId,
        updatedBy: params.actorUserId,
      })
      .returning();

    if (sourceModules.length > 0) {
      await tx.insert(academyCourseModules).values(
        sourceModules.map((module) => ({
          courseId: created.id,
          title: module.title,
          description: module.description,
          hours: module.hours,
          sortOrder: module.sortOrder,
          createdBy: params.actorUserId,
          updatedBy: params.actorUserId,
        }))
      );
    }

    return created;
  });
}
