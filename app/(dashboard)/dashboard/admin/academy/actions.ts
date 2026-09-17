'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  createCourse,
  createModule,
  createNewEdition,
  deleteModule,
  updateCourseStatus,
  updateModule,
} from '@/lib/core/academy/courses';
import { nominateInstructor } from '@/lib/core/academy/instructors';
import { assignCourseToUser } from '@/lib/core/academy/assignments';
import { recordAdminAudit } from '@/lib/core/admin/audit-log';
import type { ActionState } from '@/lib/auth/middleware';
import type { AcademyCourseStatus } from '@/lib/db/schema';

function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (error.message === 'FORBIDDEN') return 'Non autorizzato.';
    if (
      error.message.startsWith('Programma bloccato') ||
      error.message.startsWith('Le ore del modulo') ||
      error.message.startsWith('Un corso senza moduli') ||
      error.message.startsWith('Solo un corso attivo') ||
      error.message.startsWith('Solo un coach con profilo approvato') ||
      error.message.startsWith('Corso non trovato')
    ) {
      return error.message;
    }
  }
  return fallback;
}

export async function createCourseAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const edition = String(formData.get('edition') ?? '').trim();
  if (!title) return { error: 'Il titolo è obbligatorio.' };

  try {
    const created = await createCourse({
      actorUserId: admin.id,
      title,
      description: description || null,
      edition: edition || null,
    });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_course_created',
      subjectType: 'academy_course',
      subjectId: created.id,
      outcome: 'ok',
      detail: { titolo: title },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_course_created',
      subjectType: 'academy_course',
      outcome: 'fallita',
      detail: { titolo: title },
    });
    return { error: friendlyError(error, 'Impossibile creare il corso.') };
  }

  revalidatePath('/dashboard/admin/academy');
  return { success: 'Corso creato.' };
}

export async function updateCourseStatusAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const courseId = Number(formData.get('courseId'));
  const status = String(formData.get('status') ?? '') as AcademyCourseStatus;
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return { error: 'Corso non valido.' };
  }
  if (!['draft', 'active', 'cancelled'].includes(status)) {
    return { error: 'Stato non valido.' };
  }

  try {
    await updateCourseStatus({ actorUserId: admin.id, courseId, status });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_course_status_changed',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'ok',
      detail: { stato: status },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_course_status_changed',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'fallita',
      detail: { stato: status },
    });
    return { error: friendlyError(error, 'Impossibile cambiare stato.') };
  }

  revalidatePath(`/dashboard/admin/academy/${courseId}`);
  revalidatePath('/dashboard/admin/academy');
  return { success: 'Stato aggiornato.' };
}

export async function createModuleAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const courseId = Number(formData.get('courseId'));
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const hours = Number(formData.get('hours'));
  const sortOrder = Number(formData.get('sortOrder') ?? 0);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return { error: 'Corso non valido.' };
  }
  if (!title) return { error: 'Il titolo del modulo è obbligatorio.' };

  try {
    await createModule({
      actorUserId: admin.id,
      courseId,
      title,
      description: description || null,
      hours,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_module_saved',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'ok',
      detail: { titolo: title, ore: hours },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_module_saved',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'fallita',
      detail: { titolo: title },
    });
    return { error: friendlyError(error, 'Impossibile creare il modulo.') };
  }

  revalidatePath(`/dashboard/admin/academy/${courseId}`);
  return { success: 'Modulo creato.' };
}

export async function deleteModuleAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const moduleId = Number(formData.get('moduleId'));
  const courseId = Number(formData.get('courseId'));
  if (
    !Number.isInteger(moduleId) || moduleId <= 0 ||
    !Number.isInteger(courseId) || courseId <= 0
  ) {
    return { error: 'Modulo non valido.' };
  }

  try {
    await deleteModule({ actorUserId: admin.id, moduleId, courseId });
  } catch (error) {
    return { error: friendlyError(error, 'Impossibile eliminare il modulo.') };
  }

  revalidatePath(`/dashboard/admin/academy/${courseId}`);
  return { success: 'Modulo eliminato.' };
}

export async function createNewEditionAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const courseId = Number(formData.get('courseId'));
  const edition = String(formData.get('edition') ?? '').trim();
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return { error: 'Corso non valido.' };
  }

  let created;
  try {
    created = await createNewEdition({
      actorUserId: admin.id,
      courseId,
      edition: edition || null,
    });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_course_edition_created',
      subjectType: 'academy_course',
      subjectId: created.id,
      outcome: 'ok',
      detail: { corso_precedente: courseId },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_course_edition_created',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'fallita',
      detail: {},
    });
    return { error: friendlyError(error, 'Impossibile creare la nuova edizione.') };
  }

  revalidatePath('/dashboard/admin/academy');
  return { success: 'Nuova edizione creata.', newCourseId: created.id };
}

export async function nominateInstructorAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const courseId = Number(formData.get('courseId'));
  const userId = Number(formData.get('userId'));
  if (
    !Number.isInteger(courseId) || courseId <= 0 ||
    !Number.isInteger(userId) || userId <= 0
  ) {
    return { error: 'Corso o coach non valido.' };
  }

  try {
    await nominateInstructor({ actorUserId: admin.id, courseId, userId });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_instructor_nominated',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'ok',
      detail: { docente: userId },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_instructor_nominated',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'fallita',
      detail: { docente: userId },
    });
    return { error: friendlyError(error, 'Impossibile nominare il docente.') };
  }

  revalidatePath(`/dashboard/admin/academy/${courseId}`);
  return { success: 'Docente nominato.' };
}

export async function assignCourseAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const courseId = Number(formData.get('courseId'));
  const userId = Number(formData.get('userId'));
  if (
    !Number.isInteger(courseId) || courseId <= 0 ||
    !Number.isInteger(userId) || userId <= 0
  ) {
    return { error: 'Corso o coach non valido.' };
  }

  try {
    await assignCourseToUser({ actorUserId: admin.id, courseId, userId });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_course_assigned',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'ok',
      detail: { coach: userId },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'academy_course_assigned',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'fallita',
      detail: { coach: userId },
    });
    return { error: friendlyError(error, 'Impossibile assegnare il corso.') };
  }

  revalidatePath(`/dashboard/admin/academy/${courseId}`);
  return { success: 'Corso assegnato.' };
}
