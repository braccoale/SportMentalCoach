/**
 * Quanto della seduta è stato davvero registrato, per ciascuna voce.
 *
 * Nasce da una seduta di cinquantasei minuti in cui la registrazione del
 * coach si è interrotta al settimo e non è più ripartita. Il riepilogo è
 * uscito comunque, e diceva che l'atleta aveva parlato per l'83% del tempo:
 * un dato tecnicamente esatto e sostanzialmente falso, perché per
 * quarantanove minuti l'altra voce semplicemente non c'era.
 *
 * Il punto non è impedire il report — una seduta a metà è comunque materiale
 * utile — è **dichiararlo**. Un riepilogo che non dice su cosa è costruito
 * chiede di fidarsi al buio, e la prima volta che qualcuno se ne accorge da
 * solo smette di fidarsi anche quando è completo.
 *
 * Modulo puro: la copertura è aritmetica, e si verifica senza database.
 */

/**
 * Sotto questa quota la voce è considerata parzialmente registrata.
 *
 * Non è mai il 100%: una registrazione parte un istante dopo l'ingresso e si
 * chiude un istante prima dell'uscita, e qualche secondo di scarto è fisiologico.
 * Sotto il 90% invece manca qualcosa che si nota leggendo.
 */
export const PARTIAL_COVERAGE_THRESHOLD = 0.9;

export type ParticipantCoverage = {
  role: 'coach' | 'athlete';
  /** Secondi effettivamente registrati, sommando i segmenti riusciti. */
  recordedSeconds: number;
  /** Quota sulla durata della sessione, fra 0 e 1. */
  ratio: number;
  complete: boolean;
};

export type SessionCoverage = {
  sessionSeconds: number;
  participants: ParticipantCoverage[];
  /** Vero quando almeno una voce è incompleta: è il caso da raccontare. */
  hasGap: boolean;
  /** Frase pronta per l'interfaccia, vuota quando non c'è niente da dire. */
  notice: string;
};

const ROLE_LABEL: Record<ParticipantCoverage['role'], string> = {
  coach: 'del coach',
  athlete: 'dell’atleta',
};

export function assessRecordingCoverage(input: {
  sessionSeconds: number;
  /** Solo i segmenti riusciti: quelli falliti non hanno registrato nulla. */
  recorded: { role: 'coach' | 'athlete'; seconds: number }[];
}): SessionCoverage {
  const sessionSeconds = Math.max(0, Math.round(input.sessionSeconds));

  const byRole = new Map<ParticipantCoverage['role'], number>();
  for (const segment of input.recorded) {
    if (!Number.isFinite(segment.seconds) || segment.seconds <= 0) continue;
    byRole.set(segment.role, (byRole.get(segment.role) ?? 0) + segment.seconds);
  }

  const participants: ParticipantCoverage[] = (['coach', 'athlete'] as const).map(
    (role) => {
      const recordedSeconds = Math.round(byRole.get(role) ?? 0);
      // Senza una durata di sessione non si può giudicare: meglio dire
      // «completo» che inventare una lacuna che non sappiamo esistere.
      const ratio =
        sessionSeconds > 0
          ? Math.min(1, recordedSeconds / sessionSeconds)
          : 1;
      return {
        role,
        recordedSeconds,
        ratio,
        complete: ratio >= PARTIAL_COVERAGE_THRESHOLD,
      };
    }
  );

  const incomplete = participants.filter((p) => !p.complete);

  return {
    sessionSeconds,
    participants,
    hasGap: incomplete.length > 0,
    notice: incomplete.length
      ? incomplete
          .map((p) => {
            const minutes = Math.round(p.recordedSeconds / 60);
            const total = Math.round(sessionSeconds / 60);
            return `La voce ${ROLE_LABEL[p.role]} è stata registrata per ${minutes} minuti su ${total}.`;
          })
          .join(' ') +
        ' Il riepilogo è costruito solo su ciò che è stato registrato.'
      : '',
  };
}
