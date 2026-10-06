/**
 * Quali atleti un coach vede nel menu «Nuovo appuntamento».
 *
 * Prima il menu elencava **tutti** gli atleti della piattaforma. Ora sono
 * soltanto due gruppi:
 *  1. gli atleti che ha **portato lui** (si sono registrati con il suo link di
 *     invito);
 *  2. gli atleti **non portati da lui ma già «in percorso»** con lui, cioè con
 *     almeno una prenotazione aperta (richiesta o confermata): la stessa
 *     definizione di «In percorso» che usa «I miei Atleti».
 *
 * Restano fuori gli atleti che non hanno alcun legame con quel coach, e anche
 * quelli non portati da lui che hanno con lui soltanto sedute passate: per
 * rifissare una seduta con loro serve che lo richiedano o che li inviti lui.
 *
 * Modulo puro: la lettura dal database sta altrove.
 */

export function coachPickerAthleteIds(params: {
  /** Gli atleti registrati con il link di questo coach. */
  referredIds: readonly number[];
  /** Gli atleti con almeno una prenotazione aperta con questo coach. */
  inProgressIds: readonly number[];
}): number[] {
  // Prima i portati da lui; poi, senza doppioni, gli altri «in percorso».
  return [...new Set([...params.referredIds, ...params.inProgressIds])];
}
