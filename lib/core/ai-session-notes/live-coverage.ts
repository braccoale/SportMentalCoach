/**
 * Chi non sta entrando nella registrazione, **mentre** la seduta è in corso.
 *
 * `recording-coverage.ts` risponde alla stessa domanda a cose fatte, e serve a
 * dichiarare su cosa è costruito un riepilogo. Questo modulo risponde prima:
 * al minuto dieci, con la stanza aperta e il microfono acceso, si può ancora
 * rimediare — riattaccare il microfono, rientrare, chiedere all'altro di
 * controllare. Dopo non si può più.
 *
 * Nasce dalla seduta 181: quarantotto minuti di voce del coach mai registrati,
 * e nessuno che se ne sia accorto finché il riepilogo non ha detto che
 * l'atleta aveva parlato per l'83% del tempo. Il sistema lo sapeva già al
 * minuto sette. Non lo diceva a nessuno.
 *
 * Modulo puro: è aritmetica sul tempo, e si verifica senza database.
 */

/** Gli stati in cui una registrazione sta davvero raccogliendo audio adesso. */
const LIVE_STATUSES = new Set(['pending', 'starting', 'recording', 'stopping']);

/**
 * Quanto silenzio prima di parlarne.
 *
 * Non zero: fra la fine di un segmento e l'inizio del successivo passano
 * secondi anche quando tutto funziona — una ripubblicazione della traccia, una
 * riconnessione — e un avviso a ogni inciampo diventa un avviso che si impara
 * a ignorare. Novanta secondi sono oltre ogni interruzione fisiologica e
 * ancora ampiamente dentro la seduta.
 */
export const LIVE_GAP_SECONDS = 90;

export type LiveRecordingRow = {
  role: 'coach' | 'athlete';
  status: string;
  endedAt: string | null;
};

export type LiveCoverageGap = {
  role: 'coach' | 'athlete';
  /** Da quanti secondi quella voce non viene registrata. */
  sinceSeconds: number;
};

export type LiveCoverageWarning = {
  gaps: LiveCoverageGap[];
  /** Frase per chi sta in chiamata, vuota quando non c'è niente da dire. */
  message: string;
};

/**
 * Le voci ferme in questo momento, e da quanto.
 *
 * `sessionStartedAt` è il riferimento per chi non ha **mai** registrato: senza,
 * una voce mai partita non risulterebbe in ritardo di nulla — ed è il caso
 * peggiore, non il più innocuo.
 */
export function assessLiveCoverage(input: {
  sessionStatus: string;
  sessionStartedAt: Date | null;
  recordings: readonly LiveRecordingRow[];
  now: Date;
}): LiveCoverageWarning {
  // Solo a seduta viva: a registrazione chiusa il discorso lo fa la copertura
  // finale, che ha in mano i numeri definitivi.
  if (input.sessionStatus !== 'active' || !input.sessionStartedAt) {
    return { gaps: [], message: '' };
  }

  const gaps: LiveCoverageGap[] = [];
  for (const role of ['coach', 'athlete'] as const) {
    const mine = input.recordings.filter((row) => row.role === role);
    if (mine.some((row) => LIVE_STATUSES.has(row.status))) continue;

    /*
     * Da quando è ferma: dall'ultimo segmento chiuso, o dall'inizio della
     * seduta se non ne ha mai avuto uno.
     */
    const lastEnd = mine
      .map((row) => (row.endedAt ? Date.parse(row.endedAt) : Number.NaN))
      .filter((value) => Number.isFinite(value))
      .reduce<number | null>(
        (latest, value) => (latest === null || value > latest ? value : latest),
        null
      );
    const since = lastEnd ?? input.sessionStartedAt.getTime();
    const sinceSeconds = Math.floor((input.now.getTime() - since) / 1000);
    if (sinceSeconds >= LIVE_GAP_SECONDS) {
      gaps.push({ role, sinceSeconds });
    }
  }

  return { gaps, message: messageFor(gaps) };
}

/**
 * La frase, scritta per chi la legge in chiamata.
 *
 * Dice **cosa** non sta succedendo e **cosa fare**, in una riga: un avviso che
 * si limita a segnalare un guasto, mentre si sta parlando con qualcuno, è
 * rumore. E non dice «errore»: quasi sempre basta riattaccare il microfono.
 */
function messageFor(gaps: readonly LiveCoverageGap[]): string {
  if (gaps.length === 0) return '';
  const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

  if (gaps.length === 2) {
    return 'Nessuna delle due voci viene registrata da qualche minuto. Provate a spegnere e riaccendere il microfono.';
  }
  const [gap] = gaps;
  return gap.role === 'coach'
    ? `La tua voce non viene registrata da ${minutes(gap.sinceSeconds)} minuti. Prova a spegnere e riaccendere il microfono.`
    : `La voce dell’atleta non viene registrata da ${minutes(gap.sinceSeconds)} minuti. Chiedigli di spegnere e riaccendere il microfono.`;
}
