'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { parseRomeLocalDateTime } from '@/lib/core/availability';
import { createSession, cancelSession } from '@/lib/core/academy/sessions';
import {
  deleteMaterial,
  setMaterialPublished,
  uploadMaterial,
} from '@/lib/core/academy/materials';
import type { ActionState } from '@/lib/auth/middleware';
import type { AcademySessionMode } from '@/lib/db/schema';

function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (error.message === 'FORBIDDEN') return 'Non autorizzato.';
    if (
      error.message.startsWith('Orario non disponibile') ||
      error.message.startsWith('Una sessione') ||
      error.message.startsWith('Il modulo non appartiene') ||
      error.message.startsWith('Uno o più partecipanti') ||
      error.message.startsWith('Il docente non può') ||
      error.message.startsWith('La durata') ||
      error.message.startsWith('La data della sessione') ||
      error.message.startsWith('Solo un corso attivo') ||
      error.message.startsWith('Corso non trovato') ||
      error.message.startsWith('Il docente indicato') ||
      error.message.startsWith('Il file') ||
      error.message.startsWith('Tipo di file')
    ) {
      return error.message;
    }
  }
  return fallback;
}

export async function createSessionAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const coach = await requireRole('coach');
  const courseId = Number(formData.get('courseId'));
  const moduleId = Number(formData.get('moduleId'));
  const mode = String(formData.get('mode') ?? '') as AcademySessionMode;
  const scheduledForRaw = String(formData.get('scheduledFor') ?? '');
  const durationMin = Number(formData.get('durationMin'));
  const description = String(formData.get('description') ?? '').trim();
  const participantAssignmentIds = formData
    .getAll('participantAssignmentIds')
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (!Number.isInteger(courseId) || courseId <= 0 || !Number.isInteger(moduleId) || moduleId <= 0) {
    return { error: 'Corso o modulo non valido.' };
  }
  if (mode !== 'individual' && mode !== 'group') {
    return { error: 'Scegli individuale o di gruppo.' };
  }
  const scheduledFor = parseRomeLocalDateTime(scheduledForRaw);
  if (!scheduledFor) {
    return { error: 'Data e ora non valide.' };
  }
  if (!Number.isFinite(durationMin) || durationMin <= 0) {
    return { error: 'Durata non valida.' };
  }
  if (participantAssignmentIds.length === 0) {
    return { error: 'Seleziona almeno un partecipante.' };
  }

  try {
    await createSession({
      actorUserId: coach.id,
      instructorUserId: coach.id,
      courseId,
      moduleId,
      mode,
      scheduledFor,
      durationMin,
      participantAssignmentIds,
      description: description || null,
    });
  } catch (error) {
    return { error: friendlyError(error, 'Impossibile creare la sessione.') };
  }

  revalidatePath(`/dashboard/coach/academy/${courseId}`);
  return { success: 'Sessione creata.' };
}

export async function cancelSessionAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const coach = await requireRole('coach');
  const courseId = Number(formData.get('courseId'));
  const sessionId = Number(formData.get('sessionId'));
  if (
    !Number.isInteger(courseId) || courseId <= 0 ||
    !Number.isInteger(sessionId) || sessionId <= 0
  ) {
    return { error: 'Sessione non valida.' };
  }

  try {
    await cancelSession({ actorUserId: coach.id, courseId, sessionId });
  } catch (error) {
    return { error: friendlyError(error, 'Impossibile annullare la sessione.') };
  }

  revalidatePath(`/dashboard/coach/academy/${courseId}`);
  return { success: 'Sessione annullata.' };
}

export async function uploadMaterialAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const coach = await requireRole('coach');
  const moduleId = Number(formData.get('moduleId'));
  const courseId = Number(formData.get('courseId'));
  const title = String(formData.get('title') ?? '').trim();
  const file = formData.get('file');
  if (
    !Number.isInteger(moduleId) || moduleId <= 0 ||
    !Number.isInteger(courseId) || courseId <= 0
  ) {
    return { error: 'Modulo non valido.' };
  }
  if (!title) return { error: 'Il titolo del materiale è obbligatorio.' };
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Seleziona un file.' };
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await uploadMaterial({
      actorUserId: coach.id,
      courseId,
      moduleId,
      title,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      bytes,
    });
  } catch (error) {
    return { error: friendlyError(error, 'Impossibile caricare il materiale.') };
  }

  revalidatePath(`/dashboard/coach/academy/${courseId}`);
  return { success: 'Materiale caricato.' };
}

export async function toggleMaterialPublishedAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const coach = await requireRole('coach');
  const attachmentId = Number(formData.get('attachmentId'));
  const courseId = Number(formData.get('courseId'));
  const published = String(formData.get('published') ?? '') === '1';
  if (
    !Number.isInteger(attachmentId) || attachmentId <= 0 ||
    !Number.isInteger(courseId) || courseId <= 0
  ) {
    return { error: 'Materiale non valido.' };
  }

  try {
    await setMaterialPublished({ actorUserId: coach.id, courseId, attachmentId, published });
  } catch (error) {
    return { error: friendlyError(error, 'Impossibile aggiornare il materiale.') };
  }

  revalidatePath(`/dashboard/coach/academy/${courseId}`);
  return { success: published ? 'Materiale pubblicato.' : 'Materiale nascosto.' };
}

export async function deleteMaterialAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const coach = await requireRole('coach');
  const attachmentId = Number(formData.get('attachmentId'));
  const courseId = Number(formData.get('courseId'));
  if (
    !Number.isInteger(attachmentId) || attachmentId <= 0 ||
    !Number.isInteger(courseId) || courseId <= 0
  ) {
    return { error: 'Materiale non valido.' };
  }

  try {
    await deleteMaterial({ actorUserId: coach.id, courseId, attachmentId });
  } catch (error) {
    return { error: friendlyError(error, 'Impossibile eliminare il materiale.') };
  }

  revalidatePath(`/dashboard/coach/academy/${courseId}`);
  return { success: 'Materiale eliminato.' };
}
