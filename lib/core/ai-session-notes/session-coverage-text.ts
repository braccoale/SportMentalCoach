import type {
  CoverageGap,
  CoverageGapCause,
  SessionCoverage,
} from './session-coverage';

/**
 * Traduce la copertura di una sessione in italiano comprensibile.
 *
 * Separato dal calcolo perché cambia per ragioni diverse: il modello cambia
 * quando cambia lo schema, questo quando cambia il tono del prodotto.
 *
 * La regola che governa tutto: il coach non legge mai un codice d'errore, e
 * il riepilogo dichiara sempre la propria base. Un'analisi presentata come
 * completa quando copre l'ottanta per cento della seduta è peggio di nessuna
 * analisi.
 */

export type CoverageTone = 'sereno' | 'attenzione' | 'problema';

export type CoverageMessage = {
  tone: CoverageTone;
  titolo: string;
  dettagli: string[];
};

/** `2h 04m` sopra l'ora, `7m` sotto. */
export function formatCoverageDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

const CAUSE_IN_PAROLE: Record<CoverageGapCause, string> = {
  participant_left: 'una disconnessione',
  track_unpublished: 'un microfono disattivato',
  unverified_participant: "l'ingresso di un partecipante non verificato",
  recording_failed: 'una registrazione non riuscita',
  unknown: 'una causa non registrata',
};

function describeGap(gap: CoverageGap): string {
  return (
    `Un'interruzione di ${formatCoverageDuration(gap.durationMs)} ` +
    `dopo ${formatCoverageDuration(gap.startMs)} dall'inizio, ` +
    `per ${CAUSE_IN_PAROLE[gap.cause]}.`
  );
}

export function describeSessionCoverage(
  coverage: SessionCoverage
): CoverageMessage {
  const dettagli: string[] = [];

  if (coverage.sessionDurationMs > 0) {
    dettagli.push(
      `${formatCoverageDuration(coverage.recordedDurationMs)} registrati ` +
        `su ${formatCoverageDuration(coverage.sessionDurationMs)} di sessione.`
    );
  }

  for (const gap of coverage.gaps) dettagli.push(describeGap(gap));

  if (coverage.transcription.pending > 0) {
    dettagli.push(
      `${coverage.transcription.done} parti su ${coverage.transcription.total} ` +
        'completate. Le altre sono in elaborazione, di solito richiede pochi ' +
        'minuti.'
    );
  }

  if (coverage.transcription.failed > 0) {
    dettagli.push(
      'Riproviamo automaticamente; se non si risolve, il riepilogo coprirà ' +
        'solo il resto.'
    );
  }

  if (coverage.closeReason === 'closed_by_timeout') {
    dettagli.push(
      'La sessione è stata chiusa automaticamente dopo il limite di ' +
        'sicurezza: non risulta chiusa manualmente.'
    );
  }

  // La dichiarazione della base non è opzionale: è ciò che impedisce a
  // un'analisi parziale di passare per completa.
  dettagli.push(
    coverage.gaps.length === 0 && coverage.state !== 'fallita'
      ? 'Il riepilogo tiene conto di tutta la sessione.'
      : 'Il riepilogo si basa sulle parti registrate.'
  );

  switch (coverage.state) {
    case 'completa':
      return { tone: 'sereno', titolo: 'Sessione registrata per intero', dettagli };
    case 'con_interruzioni':
      return {
        tone: 'attenzione',
        titolo: `Sessione registrata al ${coverage.coveragePercent}%`,
        dettagli,
      };
    case 'in_corso':
      return { tone: 'attenzione', titolo: 'Trascrizione in corso', dettagli };
    case 'parziale':
      return {
        tone: 'problema',
        titolo: 'Trascrizione non riuscita su una parte della sessione',
        dettagli,
      };
    case 'fallita':
      return { tone: 'problema', titolo: 'Sessione non registrata', dettagli };
  }
}
