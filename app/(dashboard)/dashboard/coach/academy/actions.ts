'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { parseRomeLocalDateTime } from '@/lib/core/availability';
import { createSession, cancelSession, completeSession } from '@/lib/core/academy/sessions';
import {
  deleteMaterial,
  setMaterialPublished,
  uploadMaterial,
} from '@/lib/core/academy/materials';
import {
  generateRecap,
  editRecapContent,
  setConfidenceRating,
} from '@/lib/core/academy/recap/service';
import {
  giveConsentAndStartRecording,
  declineConsent as declineRecordingConsent,
  retryAcademyTranscription,
} from '@/lib/core/academy/recording/service';
import { AcademyRecordingDomainError } from '@/lib/core/academy/recording/state-machine';
import { recordAdminAudit } from '@/lib/core/admin/audit-log';
import type { ActionState } from '@/lib/auth/middleware';
import type { AcademyConfidenceTiming, AcademySessionMode } from '@/lib/db/schema';

/** Una lista da un campo form riga per riga — stessa convenzione già usata per "cosa imparerai". */
function linesOf(formData: FormData, name: string): string[] {
  return String(formData.get(name) ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

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
      error.message.startsWith('Tipo di file') ||
      error.message.startsWith('La trascrizione') ||
      error.message.startsWith('Sessione non trovata') ||
      error.message.startsWith('Contenuto del recap') ||
      error.message.startsWith('Nessun recap') ||
      error.message.startsWith('Solo un partecipante invitato') ||
      error.message.startsWith('La valutazione')
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
  // Anche il layout della sezione coach: il badge Academy sulla nav conta le
  // sessioni future e deve aggiornarsi ovunque, non solo su questa pagina.
  revalidatePath('/dashboard/coach', 'layout');
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
  revalidatePath('/dashboard/coach', 'layout');
  return { success: 'Sessione annullata.' };
}

export async function completeAcademySessionAction(
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
    await completeSession({ actorUserId: coach.id, courseId, sessionId });
  } catch (error) {
    return { error: friendlyError(error, 'Impossibile completare la sessione.') };
  }

  revalidatePath('/dashboard/coach', 'layout');
  revalidatePath(`/dashboard/coach/academy/${courseId}`);
  return { success: 'Sessione completata.' };
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

export async function generateAcademyRecapAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const coach = await requireRole('coach');
  const sessionId = Number(formData.get('sessionId'));
  const courseId = Number(formData.get('courseId'));
  const transcriptText = String(formData.get('transcriptText') ?? '');
  if (
    !Number.isInteger(sessionId) || sessionId <= 0 ||
    !Number.isInteger(courseId) || courseId <= 0
  ) {
    return { error: 'Sessione non valida.' };
  }

  try {
    const recap = await generateRecap({ actorUserId: coach.id, sessionId, courseId, transcriptText });
    if (recap.status === 'failed') {
      return { error: recap.errorMessage ?? 'La generazione del recap non è riuscita.' };
    }
  } catch (error) {
    return { error: friendlyError(error, 'Impossibile generare il recap.') };
  }

  revalidatePath(`/dashboard/coach/academy/${courseId}`);
  return { success: 'Recap generato.' };
}

export async function editAcademyRecapAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const coach = await requireRole('coach');
  const sessionId = Number(formData.get('sessionId'));
  const courseId = Number(formData.get('courseId'));
  if (
    !Number.isInteger(sessionId) || sessionId <= 0 ||
    !Number.isInteger(courseId) || courseId <= 0
  ) {
    return { error: 'Sessione non valida.' };
  }

  try {
    await editRecapContent({
      actorUserId: coach.id,
      sessionId,
      courseId,
      keyConcepts: linesOf(formData, 'keyConcepts'),
      toolsAndProtocols: linesOf(formData, 'toolsAndProtocols'),
      practicalCases: linesOf(formData, 'practicalCases'),
      openQuestions: linesOf(formData, 'openQuestions'),
      nextAction: String(formData.get('nextAction') ?? '').trim(),
      topicsCovered: linesOf(formData, 'topicsCovered'),
    });
  } catch (error) {
    return { error: friendlyError(error, 'Impossibile correggere il recap.') };
  }

  revalidatePath(`/dashboard/coach/academy/${courseId}`);
  return { success: 'Recap corretto.' };
}

function recordingErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AcademyRecordingDomainError) return error.message;
  return friendlyError(error, fallback);
}

/**
 * Il docente dà il consenso e la registrazione parte nello stesso gesto —
 * niente conferma intermedia, per non farla percepire come un ostacolo.
 * Un evento sensibile: entra nel registro amministrativo anche se non è
 * l'admin a compierlo, stessa logica del consenso nella pipeline prenotazioni.
 */
export async function startAcademyRecordingAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const coach = await requireRole('coach');
  const sessionId = Number(formData.get('sessionId'));
  const courseId = Number(formData.get('courseId'));
  if (!Number.isInteger(sessionId) || sessionId <= 0 || !Number.isInteger(courseId) || courseId <= 0) {
    return { error: 'Sessione non valida.' };
  }

  try {
    await giveConsentAndStartRecording({ actorUserId: coach.id, sessionId });
    await recordAdminAudit({
      actor: { id: coach.id, email: coach.email },
      action: 'academy_recording_consent_given',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'ok',
      detail: { sessione: sessionId },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: coach.id, email: coach.email },
      action: 'academy_recording_consent_given',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'fallita',
      detail: { sessione: sessionId },
    });
    return { error: recordingErrorMessage(error, 'Impossibile avviare la registrazione.') };
  }

  revalidatePath(`/dashboard/coach/academy/${courseId}`);
  return { success: 'Registrazione avviata.' };
}

export async function declineAcademyRecordingAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const coach = await requireRole('coach');
  const sessionId = Number(formData.get('sessionId'));
  const courseId = Number(formData.get('courseId'));
  if (!Number.isInteger(sessionId) || sessionId <= 0 || !Number.isInteger(courseId) || courseId <= 0) {
    return { error: 'Sessione non valida.' };
  }

  try {
    await declineRecordingConsent({ actorUserId: coach.id, sessionId });
    await recordAdminAudit({
      actor: { id: coach.id, email: coach.email },
      action: 'academy_recording_consent_declined',
      subjectType: 'academy_course',
      subjectId: courseId,
      outcome: 'ok',
      detail: { sessione: sessionId },
    });
  } catch (error) {
    return { error: recordingErrorMessage(error, 'Impossibile registrare la scelta.') };
  }

  revalidatePath(`/dashboard/coach/academy/${courseId}`);
  return { success: 'Sessione non registrata.' };
}

/** Ripartenza esplicita dopo un fallimento della trascrizione o del recap — l'audio è già in bucket. */
export async function retryAcademyTranscriptionAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const coach = await requireRole('coach');
  const sessionId = Number(formData.get('sessionId'));
  const courseId = Number(formData.get('courseId'));
  if (!Number.isInteger(sessionId) || sessionId <= 0 || !Number.isInteger(courseId) || courseId <= 0) {
    return { error: 'Sessione non valida.' };
  }

  try {
    await retryAcademyTranscription({ actorUserId: coach.id, sessionId });
  } catch (error) {
    return { error: recordingErrorMessage(error, 'Impossibile riprendere la trascrizione.') };
  }

  revalidatePath(`/dashboard/coach/academy/${courseId}`);
  return { success: 'Trascrizione ripresa.' };
}

export async function setConfidenceRatingAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const coach = await requireRole('coach');
  const sessionId = Number(formData.get('sessionId'));
  const courseId = Number(formData.get('courseId'));
  const timing = String(formData.get('timing') ?? '') as AcademyConfidenceTiming;
  const rating = Number(formData.get('rating'));
  if (
    !Number.isInteger(sessionId) || sessionId <= 0 ||
    !Number.isInteger(courseId) || courseId <= 0 ||
    (timing !== 'before' && timing !== 'after')
  ) {
    return { error: 'Valutazione non valida.' };
  }

  try {
    await setConfidenceRating({ actorUserId: coach.id, sessionId, courseId, timing, rating });
  } catch (error) {
    return { error: friendlyError(error, 'Impossibile salvare la valutazione.') };
  }

  revalidatePath(`/dashboard/coach/academy/${courseId}`);
  return { success: 'Valutazione salvata.' };
}
