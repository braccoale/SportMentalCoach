export type AutoCompletionCandidate = {
  status: string;
  sessionStartedAt: Date | null;
  authenticatedParticipantCount: number;
  hasAiNotesSession: boolean;
};

/**
 * Una stanza vuota non basta a dire che una sessione si e' svolta.
 *
 * L'autocompletamento e' riservato alle call confermate in cui sono entrati
 * davvero entrambi i partecipanti, il heartbeat ha scritto un inizio e non e'
 * mai stata aperta la registrazione AI. Le sessioni registrate conservano il
 * loro flusso esplicito di chiusura, necessario a finalizzare audio e report.
 */
export function shouldAutoCompleteUnrecordedBooking(
  candidate: AutoCompletionCandidate
): boolean {
  return (
    candidate.status === 'accepted' &&
    candidate.sessionStartedAt !== null &&
    candidate.authenticatedParticipantCount >= 2 &&
    !candidate.hasAiNotesSession
  );
}
