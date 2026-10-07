/**
 * Sintesi operativa di una seduta conclusa.
 *
 * Questa email serve a capire in pochi secondi chi ha lavorato con chi e se
 * Appunti AI ha terminato il proprio lavoro. La diagnostica completa resta nel
 * pannello amministrativo e nei log interni: non viene duplicata nella posta.
 * Non entra mai il contenuto della conversazione.
 */

export type OutcomeVerdict = 'ok' | 'parziale' | 'fallita' | 'rifiutata';

export type OutcomeCoverage = {
  role: 'coach' | 'athlete';
  recordedSeconds: number;
  ratio: number;
  complete: boolean;
};

export type SessionOutcomeSnapshot = {
  sessionId: number;
  bookingId: number;
  athleteUserId: number;
  coachName: string;
  athleteName: string;
  status: string;
  errorCode: string | null;
  /**
   * Il codice vero dell'ultimo guasto, letto dalla traccia di audit. La riga di
   * sessione puo' averlo nullo anche dopo un fallimento: e' gia' successo, e la
   * mail non diceva perche'.
   */
  failureCode?: string | null;
  scheduledFor: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  processingCompletedAt: Date | null;
  sessionSeconds: number;
  coverage: OutcomeCoverage[];
  transcriptSegments: number;
  reportId: number | null;
  reportThemesCount: number | null;
};

export type OutcomeEmailSummary = {
  subject: string;
  title: string;
  preview: string;
  intro: string;
  details: Array<{
    label: string;
    value: string;
    emphasis?: boolean;
    separatorBefore?: boolean;
  }>;
  nextStep: string;
  actionLabel: string;
  sessionId: number;
};

const FAILED_STATUSES = ['transcription_failed', 'report_failed', 'cancelled'];
const SUCCESS_STATUSES = ['ready_for_review', 'approved', 'shared'];

export function classifySessionOutcome(
  snapshot: Pick<SessionOutcomeSnapshot, 'status' | 'coverage' | 'reportId' | 'reportThemesCount'>
): OutcomeVerdict {
  if (snapshot.status === 'consent_rejected') return 'rifiutata';
  if (FAILED_STATUSES.includes(snapshot.status)) return 'fallita';
  if (!SUCCESS_STATUSES.includes(snapshot.status)) return 'ok';
  if (snapshot.coverage.some((participant) => !participant.complete)) return 'parziale';
  if (snapshot.reportId !== null && snapshot.reportThemesCount === 0) return 'parziale';
  return 'ok';
}

function formatDateTime(value: Date | null): string {
  if (!value) return 'Non indicata';
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Rome',
  }).format(value);
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minuti'}`;
}

export function transcriptionStatus(snapshot: SessionOutcomeSnapshot): string {
  if (snapshot.status === 'consent_rejected') return 'Non eseguita: consenso non fornito';
  if (snapshot.transcriptSegments > 0) return 'Completata';
  if (snapshot.status === 'transcription_failed') return 'Non riuscita';
  return 'Non disponibile';
}

export function aiSummaryStatus(snapshot: SessionOutcomeSnapshot): string {
  if (snapshot.reportId !== null) {
    if (snapshot.status === 'shared') return "Condiviso con l'atleta";
    if (snapshot.status === 'approved') return 'Approvato dal coach';
    return 'Pronto per la revisione del coach';
  }
  if (snapshot.status === 'report_failed') return 'Non riuscito';
  if (snapshot.status === 'transcription_failed') return 'Non creato: manca la trascrizione';
  if (snapshot.status === 'consent_rejected') return 'Non previsto';
  return 'Non disponibile';
}

/**
 * Il perche' di un fallimento, in una riga per chi tiene su il sistema e con
 * il rimedio quando e' noto. Solo codici: mai testo del provider, che potrebbe
 * contenere frasi della seduta.
 */
export function describeFailureReason(code: string | null | undefined): string | null {
  if (!code) return null;
  const base = code.split(':')[0];
  switch (base) {
    case 'COMPASS_QUOTA_EXHAUSTED':
      return 'Credito OpenAI esaurito. Ricarica il credito su platform.openai.com (Billing), poi riapri la sessione.';
    case 'COMPASS_RATE_LIMITED':
      return 'OpenAI ha limitato le richieste (troppe in poco tempo). Si riprova da solo.';
    case 'COMPASS_TIMEOUT':
      return 'Il riepilogo ha richiesto troppo tempo. Si riprova su un worker più lungo.';
    case 'COMPASS_UNAVAILABLE':
      return "Configurazione OpenAI non disponibile (chiave o modello).";
    case 'COMPASS_INVALID':
      return 'Il riepilogo non ha superato i controlli di verifica.';
    case 'COMPASS_FAILED':
      return 'OpenAI ha risposto con un errore.';
    case 'NO_AUDIO_RECORDED':
      return 'Nessun audio registrato.';
    default:
      return `Codice errore: ${base}`;
  }
}

function recordingStatus(snapshot: SessionOutcomeSnapshot): string {
  if (snapshot.status === 'consent_rejected') return 'Non avviata';
  if (snapshot.coverage.length === 0) return 'Non disponibile';
  return snapshot.coverage.every((participant) => participant.complete) ? 'Completa' : 'Parziale';
}

function nextStep(snapshot: SessionOutcomeSnapshot, verdict: OutcomeVerdict): string {
  if (verdict === 'rifiutata') return "Nessuna azione necessaria: l'atleta non ha autorizzato la registrazione e Appunti AI non è stato avviato.";
  if (snapshot.status === 'transcription_failed') return 'La trascrizione non è stata completata. Apri Appunti AI per controllare la sessione e riprovare.';
  if (snapshot.status === 'report_failed') return 'La trascrizione è disponibile, ma il riepilogo non è stato creato. Apri Appunti AI per riprovare.';
  if (snapshot.status === 'cancelled') return 'La registrazione si è chiusa prima di completare la lavorazione. Apri Appunti AI per controllare la sessione.';
  if (verdict === 'parziale') return 'Controlla il riepilogo prima di usarlo: una parte della registrazione potrebbe essere incompleta.';
  if (snapshot.status === 'ready_for_review') return 'Il riepilogo è pronto: il coach può controllarlo e approvarlo.';
  if (snapshot.status === 'approved') return 'Nessuna azione necessaria: il coach ha già approvato il riepilogo.';
  if (snapshot.status === 'shared') return "Nessuna azione necessaria: il riepilogo è già stato condiviso con l'atleta.";
  return 'Nessuna azione necessaria.';
}

function subjectEnding(snapshot: SessionOutcomeSnapshot, verdict: OutcomeVerdict): string {
  if (verdict === 'rifiutata') return 'consenso non fornito';
  if (snapshot.status === 'transcription_failed') return 'trascrizione non riuscita';
  if (snapshot.status === 'report_failed') return 'riepilogo non riuscito';
  if (snapshot.status === 'cancelled') return 'elaborazione interrotta';
  if (verdict === 'parziale') return 'registrazione da controllare';
  return 'trascrizione completata';
}

export function buildOutcomeEmail(snapshot: SessionOutcomeSnapshot): OutcomeEmailSummary {
  const verdict = classifySessionOutcome(snapshot);
  const subject = `[KaiPai] ${snapshot.coachName} con ${snapshot.athleteName}: ${subjectEnding(snapshot, verdict)}`;
  const intro = `${snapshot.coachName} ha svolto una sessione con ${snapshot.athleteName}. Ecco l'esito di Appunti AI.`;
  const reason =
    verdict === 'fallita'
      ? describeFailureReason(snapshot.failureCode ?? snapshot.errorCode)
      : null;
  return {
    subject,
    title: verdict === 'ok' ? 'Appunti AI ha completato la sessione' : "Controlla l'esito della sessione",
    preview: `${snapshot.coachName} con ${snapshot.athleteName}: ${transcriptionStatus(snapshot)}`,
    intro,
    details: [
      { label: 'Coach', value: snapshot.coachName },
      { label: 'Atleta', value: snapshot.athleteName },
      { label: 'Data e ora', value: formatDateTime(snapshot.scheduledFor), emphasis: true },
      { label: 'Durata', value: formatDuration(snapshot.sessionSeconds) },
      { label: 'Registrazione', value: recordingStatus(snapshot), separatorBefore: true },
      { label: 'Trascrizione AI', value: transcriptionStatus(snapshot) },
      { label: 'Riepilogo AI', value: aiSummaryStatus(snapshot) },
      ...(reason ? [{ label: 'Motivo', value: reason, emphasis: true }] : []),
    ],
    nextStep: nextStep(snapshot, verdict),
    actionLabel: snapshot.reportId ? 'Apri il riepilogo' : 'Apri Appunti AI',
    sessionId: snapshot.sessionId,
  };
}

export function outcomeSubject(snapshot: SessionOutcomeSnapshot): string {
  return buildOutcomeEmail(snapshot).subject;
}

/** Testo alternativo per i client che non visualizzano HTML. */
export function buildOutcomeReport(snapshot: SessionOutcomeSnapshot): string {
  const email = buildOutcomeEmail(snapshot);
  return [email.intro, '', ...email.details.map(({ label, value }) => `${label}: ${value}`), '', `Cosa fare: ${email.nextStep}`].join('\n');
}
