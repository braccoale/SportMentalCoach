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
 * che l'origine sia rimasta la nostra.**
 *
 * **E verifica ciò che restituisce, non ciò che riceve.** Questa parte è
 * costata un secondo tentativo: `/..//altro-sito` risolve a un pathname
 * `//altro-sito` — i segmenti `..` risalgono oltre la radice e collassano — e
 * quel pathname supera il controllo sull'origine perché *durante* la
 * risoluzione siamo ancora in casa. Ma la stringa che tornava indietro era
 * protocol-relative, e il chiamante la risolve una seconda volta: `//altro-sito`
 * diventa `https://altro-sito/`. Controllare l'ingresso non serve a niente se
 * si consegna qualcos'altro. Ora l'esito passa dallo stesso controllo, e
 * l'unica cosa che esce da qui è una stringa che è già stata verificata **così
 * com'è**.
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

  // Dopo la risoluzione siamo ancora in casa? `//altro`, `/\altro` e
  // `/⏎/altro` falliscono qui.
  if (resolved.origin !== PROBE_ORIGIN) return null;

  // La forma normalizzata è quella che il browser userebbe davvero, quindi è
  // quella su cui vale la pena decidere — quella in ingresso no.
  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;

  // Lo stesso controllo, sull'esito. Non è una ripetizione difensiva: chi
  // riceve questa stringa la risolve una seconda volta, e `/..//altro` arriva
  // fin qui come `//altro`, che alla seconda risoluzione esce dal sito. Una
  // cosa è sicura da restituire solo se sopravvive al viaggio che farà.
  if (new URL(path, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return null;

  return path;
}
