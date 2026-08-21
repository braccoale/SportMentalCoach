/**
 * Quando vale la pena riprovare ad avviare una registrazione interrotta.
 *
 * Nasce dalla stessa seduta della copertura: il coach registrato per sette
 * minuti su cinquantasei. Guardando il registro, il riavvio era stato
 * tentato — due volte, a tre secondi di distanza — e poi mai più. Per
 * quarantanove minuti la stanza è rimasta aperta, la traccia pubblicata,
 * l'audio recuperabile, e nessuno ci ha riprovato.
 *
 * Due tentativi in tre secondi non battono un guasto che dura più di un
 * istante: coprono l'inciampo momentaneo e nient'altro. Un limite del
 * provider, una stanza che sta ancora salendo, una rete che torna dopo un
 * minuto — tutti casi in cui riprovare più tardi funziona — finivano
 * catalogati come perdita definitiva.
 *
 * La regola è: riprovare per un po', a distanze crescenti, e poi smettere.
 * Smettere conta quanto riprovare: una traccia che non ripartirà mai — il
 * partecipante ha chiuso, il consenso è stato revocato — non deve far girare
 * un tentativo ogni cinque minuti fino a fine seduta.
 *
 * Modulo puro: decidere è aritmetica sul tempo, e si verifica senza LiveKit
 * né database.
 */

/**
 * Distanze fra un tentativo e il successivo.
 *
 * Cresce perché le due cause hanno tempi diversi: un inciampo si risolve in
 * secondi, un limite del provider o una stanza in avvio in minuti. Partire
 * larghi perderebbe il primo caso, restare stretti sprecherebbe tentativi
 * sul secondo.
 *
 * Chi chiama passa ogni cinque minuti, quindi i primi due scarti si
 * comportano di fatto come «al prossimo giro»: valgono per le sveglie più
 * frequenti (il webhook di LiveKit) e non fanno danno qui.
 */
export const RETRY_DELAYS_SECONDS = [30, 120, 300, 900] as const;

/** Oltre questo, la seduta è comunque quasi finita: riprendere non serve. */
export const MAX_RETRY_ATTEMPTS = RETRY_DELAYS_SECONDS.length;

export type RetryDecision =
  | { retry: true; attempt: number }
  | { retry: false; reason: 'too_soon' | 'exhausted' | 'not_recoverable' };

export function decideRecordingRetry(input: {
  /** Tentativi di avvio già falliti per questa traccia. Almeno 1. */
  failedAttempts: number;
  /** Quando è fallito l'ultimo tentativo. */
  lastFailureAt: Date;
  now: Date;
  /**
   * La stanza è ancora aperta e la traccia ancora pubblicata.
   *
   * Senza questo non c'è niente da registrare: riprovare produrrebbe solo un
   * altro fallimento identico, e un registro pieno di righe che non
   * raccontano nulla.
   */
  trackStillLive: boolean;
}): RetryDecision {
  if (!input.trackStillLive) {
    return { retry: false, reason: 'not_recoverable' };
  }
  if (input.failedAttempts >= MAX_RETRY_ATTEMPTS) {
    return { retry: false, reason: 'exhausted' };
  }

  // Il primo fallimento ha indice 0 nella tabella delle distanze.
  const waitSeconds = RETRY_DELAYS_SECONDS[input.failedAttempts - 1] ?? 0;
  const elapsedSeconds =
    (input.now.getTime() - input.lastFailureAt.getTime()) / 1000;

  if (elapsedSeconds < waitSeconds) {
    return { retry: false, reason: 'too_soon' };
  }
  return { retry: true, attempt: input.failedAttempts + 1 };
}

/**
 * C'è ancora una voce da registrare per questa persona?
 *
 * È la domanda giusta per decidere se riprovare, e non «esiste ancora *quella*
 * traccia»: una traccia che si interrompe viene ripubblicata con un SID nuovo,
 * quindi cercare il SID fallito significa non trovarlo proprio nel caso in cui
 * il recupero serve. Il riavvio non registra un SID scelto prima: rilegge la
 * stanza e registra ciò che è pubblicato in quel momento.
 */
export function hasLiveAudioTrack(
  participants: readonly {
    identity: string;
    tracks: readonly { type: 'audio' | 'video' }[];
  }[],
  identity: string
): boolean {
  return participants.some(
    (participant) =>
      participant.identity === identity &&
      participant.tracks.some((track) => track.type === 'audio')
  );
}

/**
 * Quanto una traccia appena fallita resta ferma prima di essere ritentata.
 *
 * Nella seduta 181 il riavvio è stato tentato **due volte a duecento
 * millisecondi di distanza**, e LiveKit ha risposto «Too Many Requests» a
 * entrambe. Il secondo tentativo non era una seconda possibilità: era la
 * causa del rifiuto, e per giunta bruciava uno dei quattro tentativi
 * disponibili contro un limite che dura più di un istante.
 *
 * Dieci secondi: abbastanza perché due eventi ravvicinati non diventino due
 * chiamate — un `track_published` doppio, un webhook consegnato due volte —
 * e abbastanza poco da non ritardare il ripescaggio vero, che parte comunque
 * a trenta secondi.
 */
export const START_COOLDOWN_SECONDS = 10;

/**
 * Vero quando questa traccia ha fallito troppo poco fa perché riprovare adesso
 * sia qualcosa di diverso dal ripetere la stessa chiamata.
 */
export function isWithinStartCooldown(input: {
  lastFailureAt: Date | null;
  now: Date;
}): boolean {
  if (!input.lastFailureAt) return false;
  const elapsedSeconds =
    (input.now.getTime() - input.lastFailureAt.getTime()) / 1000;
  // Un orologio che va indietro non deve aprire la porta: un fallimento «nel
  // futuro» è comunque recentissimo.
  return elapsedSeconds < START_COOLDOWN_SECONDS;
}
