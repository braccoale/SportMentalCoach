import { CANONICAL_APP_URL } from '@/lib/core/site';

/*
 * Ultima rete prima della vera consegna, non la prima linea di difesa:
 * `getAppBaseUrl()` è già pensato per non restituire mai localhost in
 * produzione vera (Vercel imposta sempre `VERCEL_ENV`), ma `.env.local`
 * imposta `BASE_URL` in modo esplicito per lo sviluppo locale — e
 * quell'esplicito vince sempre, anche quando uno script locale (una verifica
 * puntuale, un recupero manuale) arriva comunque a innescare un invio vero
 * contro il database di produzione. Un link a localhost, in quel momento,
 * non può mai raggiungere un destinatario vero: si corregge da solo invece
 * di uscire rotto — un'email col link giusto vale più di una bloccata sul
 * nascere per un dettaglio recuperabile. Usata da `sendEmail` — l'unico
 * varco per cui passa ogni email reale del prodotto.
 *
 * Un'espressione regolare nuova ad ogni chiamata, di proposito: con il flag
 * `g` condiviso su un'unica istanza, `.test()` avanza `lastIndex` e la
 * chiamata successiva sullo stesso oggetto può restituire un falso negativo
 * — esattamente il tipo di bug che questa rete di sicurezza dovrebbe
 * eliminare, non introdurre.
 */
function localhostLinkPattern(): RegExp {
  return /https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/gi;
}

/** Se il testo contiene un link a localhost — mai un indirizzo raggiungibile
 * da un vero destinatario. */
export function containsLocalhostLink(value: string): boolean {
  return localhostLinkPattern().test(value);
}

/** Sostituisce ogni link a localhost con il dominio pubblico canonico. */
export function replaceLocalhostLinks(value: string): string {
  return value.replace(localhostLinkPattern(), CANONICAL_APP_URL);
}
