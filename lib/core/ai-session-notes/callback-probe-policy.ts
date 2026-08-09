/**
 * Come si legge la risposta alla prova di callback.
 *
 * Modulo puro: la rete non si prova, questa traduzione si'. E' la parte che
 * decide se un indirizzo va bene, quindi e' anche quella che deve essere
 * verificabile senza uscire dal processo.
 */

export type CallbackProbeResult = {
  reachable: boolean;
  /** L'origine provata. Mai il token, che e' un segreto anche se finto. */
  origin: string | null;
  /** Cosa e' andato storto, in una frase leggibile da chi amministra. */
  detail: string;
  httpStatus?: number;
};

/**
 * Traduce lo stato HTTP in un verdetto.
 *
 * Separata perché è la parte che vale la pena provare: la rete no, questo sì.
 */
export function interpretProbeResponse(
  origin: string,
  status: number
): CallbackProbeResult {
  if (status === 404) {
    return {
      reachable: true,
      origin,
      httpStatus: status,
      detail: 'Il provider può richiamarci a questo indirizzo.',
    };
  }
  if (status === 401 || status === 403) {
    return {
      reachable: false,
      origin,
      httpStatus: status,
      detail:
        'L’indirizzo è protetto da autenticazione: il provider verrebbe respinto. Usa il dominio pubblico del sito.',
    };
  }
  if (status >= 300 && status < 400) {
    return {
      reachable: false,
      origin,
      httpStatus: status,
      detail:
        'L’indirizzo risponde con un redirect e il provider non lo seguirà. Configura direttamente il dominio finale, con il www se serve.',
    };
  }
  return {
    reachable: false,
    origin,
    httpStatus: status,
    detail: `Risposta inattesa (${status}): l’indirizzo non si comporta come il nostro endpoint di callback.`,
  };
}
