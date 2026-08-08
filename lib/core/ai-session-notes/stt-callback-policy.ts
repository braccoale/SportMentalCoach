/**
 * Politica di validazione del token di callback STT.
 *
 * Modulo puro: la forma di un token è una regola, non un accesso al
 * database, e va potuta verificare senza.
 */

/**
 * Il token è generato da noi: 32 byte casuali in esadecimale minuscolo.
 *
 * È l'unica credenziale della callback. L'header `dg-token` di Deepgram non
 * basterebbe: è l'identificatore della chiave API, non un segreto. Il
 * controllo di forma serve anche a impedire che un percorso travestito da
 * token arrivi a una query.
 */
export function isCallbackTokenWellFormed(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token);
}
