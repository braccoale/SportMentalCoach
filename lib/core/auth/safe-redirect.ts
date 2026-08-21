/**
 * Dove è lecito rimandare qualcuno dopo l'autenticazione.
 *
 * L'indirizzo arriva da un parametro nella barra degli indirizzi, quindi è
 * scritto da chi ci arriva. Senza questo filtro, un collegamento del tipo
 * `/sign-in?redirect=https://sito-che-imita-kaipai.example` porterebbe l'utente
 * a rifare l'accesso su una pagina che non è nostra, subito dopo un accesso
 * riuscito sul nostro dominio — che è il momento in cui uno si fida di più.
 *
 * **Perché non basta guardare come comincia la stringa.** La prima versione di
 * questo modulo rifiutava `//altro-sito` e `/\altro-sito`, e sembrava
 * sufficiente. Non lo era: prima di risolvere un indirizzo relativo il browser
 * **elimina tabulazioni e ritorni a capo**, quindi `/⏎/altro-sito` supera
 * qualunque confronto sui primi caratteri e poi diventa `https://altro-sito/`.
 * Lo stesso vale per `\t` e `\r`.
 *
 * Da qui la forma attuale, che non prova più a elencare le scritture
 * pericolose: **risolve l'indirizzo con le stesse regole del browser e verifica
 * che l'origine sia rimasta la nostra.** Una scrittura a cui non avevo pensato
 * non è più un buco, perché non è l'elenco a decidere.
 */

/** Origine fittizia: serve solo a risolvere, e non compare mai nel risultato. */
const PROBE_ORIGIN = 'https://kaipai.invalid';

export function safeRedirectPath(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  // Deve *sembrare* un percorso: taglia subito `https://…`, `javascript:` e
  // simili, senza dover ragionare su cosa farebbe il browser.
  if (!value.startsWith('/')) return null;

  let resolved: URL;
  try {
    resolved = new URL(value, PROBE_ORIGIN);
  } catch {
    return null;
  }

  // Il controllo vero: dopo la risoluzione siamo ancora in casa? `//altro`,
  // `/\altro` e `/⏎/altro` falliscono tutti qui, e con loro qualunque
  // variante che non ho previsto.
  if (resolved.origin !== PROBE_ORIGIN) return null;

  // Si restituisce la forma normalizzata, non quella in ingresso: è quella che
  // il browser userebbe davvero, quindi è quella su cui abbiamo deciso.
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
