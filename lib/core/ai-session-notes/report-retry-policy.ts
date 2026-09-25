/**
 * Quando un riepilogo fallito si riprova da solo, e su quale worker.
 *
 * Due decisioni, entrambe pure e senza I/O, così si verificano con un `now`
 * fisso e senza database.
 *
 * **La riapertura automatica.** Fino a ieri `report_failed → processing` era
 * solo manuale: un comando a mano, dopo che qualcuno si accorgeva del
 * problema. Otto sedute sono rimaste ferme finché non le ho riaperte io, e
 * tutte si sono recuperate al primo giro. Riaprire è sicuro quando la
 * trascrizione c'è: il materiale non è cambiato, si rifà solo l'ultimo passo.
 * Il limite serve al caso opposto — una seduta che non potrà mai riuscire non
 * deve diventare un ciclo di chiamate a pagamento.
 *
 * **Il worker lungo.** Il worker di Vercel ha un minuto e la generazione ne
 * usa 25-45: le sedute lunghe sforano, e riprovarle sullo stesso worker
 * sforerebbe di nuovo. Un job fallito per tempo viene quindi marcato per il
 * worker lungo, che gira fuori da Vercel e non ha quel tetto. Se quel worker
 * non è configurato o non gira, dopo un periodo di grazia il job torna a
 * Vercel: nel caso peggiore si è dove si era prima, mai peggio.
 */

/** Riaperture automatiche per seduta. Oltre, decide una persona. */
export const MAX_AUTOMATIC_REOPENINGS = 2;

/** Pausa fra un fallimento e la riapertura successiva. */
export const AUTOMATIC_REOPEN_COOLDOWN_MS = 15 * 60_000;

/**
 * Oltre questa età un `report_failed` non si riapre da solo.
 *
 * Una seduta ferma da settimane non è un incidente da rimediare: è un caso su
 * cui qualcuno ha già deciso qualcosa, o nessuno ha guardato, e una
 * riapertura silenziosa farebbe comparire un riepilogo dove non era atteso.
 */
export const AUTOMATIC_REOPEN_MAX_AGE_MS = 14 * 24 * 60 * 60_000;

export const LONG_RUNNER = 'long' as const;

/** Quanto un job per il worker lungo aspetta prima che Vercel lo riprenda. */
export const LONG_RUNNER_GRACE_MS = 30 * 60_000;

export type AutomaticReopenFacts = {
  status: string;
  /** Segmenti di trascrizione presenti: senza, non c'è niente da riprendere. */
  segmentCount: number;
  /** Riaperture automatiche già fatte su questa seduta. */
  automaticReopenCount: number;
  /** Quando la seduta è passata a `report_failed`, se lo si sa. */
  failedAt: Date | null;
  now: Date;
};

export type AutomaticReopenDecision =
  | { reopen: true }
  | {
      reopen: false;
      reason:
        | 'NOT_FAILED'
        | 'NO_TRANSCRIPT'
        | 'LIMIT_REACHED'
        | 'TOO_SOON'
        | 'TOO_OLD'
        | 'UNKNOWN_FAILURE_TIME';
    };

export function decideAutomaticReopen(
  facts: AutomaticReopenFacts
): AutomaticReopenDecision {
  if (facts.status !== 'report_failed') {
    return { reopen: false, reason: 'NOT_FAILED' };
  }
  if (facts.segmentCount < 1) {
    return { reopen: false, reason: 'NO_TRANSCRIPT' };
  }
  if (facts.automaticReopenCount >= MAX_AUTOMATIC_REOPENINGS) {
    return { reopen: false, reason: 'LIMIT_REACHED' };
  }
  // Senza sapere quando è fallita non si può dire che la pausa sia passata, né
  // che non sia troppo vecchia: si lascia a una persona, senza indovinare.
  if (!facts.failedAt) {
    return { reopen: false, reason: 'UNKNOWN_FAILURE_TIME' };
  }
  const elapsed = facts.now.getTime() - facts.failedAt.getTime();
  if (elapsed > AUTOMATIC_REOPEN_MAX_AGE_MS) {
    return { reopen: false, reason: 'TOO_OLD' };
  }
  if (elapsed < AUTOMATIC_REOPEN_COOLDOWN_MS) {
    return { reopen: false, reason: 'TOO_SOON' };
  }
  return { reopen: true };
}

/**
 * Un fallimento per tempo si riprova dove il tempo non manca.
 *
 * Solo `COMPASS_TIMEOUT`: è l'unico errore che un ambiente diverso può
 * cambiare. Un riepilogo respinto dal contratto non ha bisogno di più
 * secondi, e mandarlo al worker lungo lo lascerebbe ad aspettare per niente.
 */
export function routesToLongRunner(errorCode: string | null | undefined): boolean {
  return errorCode === 'COMPASS_TIMEOUT';
}
