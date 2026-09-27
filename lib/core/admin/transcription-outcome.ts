/**
 * L'esito della trascrizione AI di una seduta, in una parola per l'elenco
 * Sessioni dell'amministrazione.
 *
 * Risponde a «la trascrizione è andata a buon fine?», che è una domanda diversa
 * da «è partita?» (`aiTranscriptionActivated`). Lo stato della seduta da solo
 * non basta: `report_failed` significa che la trascrizione c'è e manca il
 * riepilogo, e una seduta `ready_for_review` senza segmenti non ha nulla da
 * mostrare. Per questo entra anche il numero di segmenti.
 *
 * Modulo puro: nessun I/O. Gli stati sono quelli di `state-machine.ts`.
 */

export type TranscriptionOutcomeKind =
  | 'none'
  | 'waiting'
  | 'in_progress'
  | 'done'
  | 'summary_failed'
  | 'failed'
  | 'refused';

export type TranscriptionOutcome = {
  kind: TranscriptionOutcomeKind;
  label: string;
};

export type TranscriptionOutcomeInput = {
  /** Stato dell'ultima riga `session_ai_notes` della prenotazione; null se non esiste. */
  aiTranscriptionStatus: string | null;
  /** Segmenti di trascrizione di quella riga. */
  transcriptSegments: number;
};

export function transcriptionOutcome({
  aiTranscriptionStatus,
  transcriptSegments,
}: TranscriptionOutcomeInput): TranscriptionOutcome {
  switch (aiTranscriptionStatus) {
    case null:
      return { kind: 'none', label: 'Non avviata' };
    case 'waiting_for_consent':
      return { kind: 'waiting', label: 'In attesa di consenso' };
    case 'consent_rejected':
      return { kind: 'refused', label: 'Consenso negato' };
    case 'active':
    case 'processing':
      return { kind: 'in_progress', label: 'In corso' };
    case 'transcription_failed':
      return { kind: 'failed', label: 'Non riuscita' };
    case 'report_failed':
      return transcriptSegments > 0
        ? { kind: 'summary_failed', label: 'Trascritta, riepilogo fallito' }
        : { kind: 'failed', label: 'Non riuscita' };
    case 'ready_for_review':
    case 'approved':
    case 'shared':
      // Un riepilogo pronto sopra zero segmenti non è un successo: non si
      // sa da che cosa sia stato scritto.
      return transcriptSegments > 0
        ? { kind: 'done', label: 'Riuscita' }
        : { kind: 'failed', label: 'Vuota' };
    case 'cancelled':
      return { kind: 'failed', label: 'Interrotta' };
    default:
      return { kind: 'none', label: aiTranscriptionStatus };
  }
}
