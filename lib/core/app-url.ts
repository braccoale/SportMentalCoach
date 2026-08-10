import 'server-only';
import { CANONICAL_APP_URL, fallbackAppOrigin } from '@/lib/core/site';

export { CANONICAL_APP_URL };

/**
 * Origine pubblica usata in tutti i link che escono da KaiPai: inviti, accesso
 * ospite alla chiamata, email.
 *
 * `BASE_URL` resta l'autorita': permette di puntare altrove senza toccare il
 * codice. Quando non c'e', pero', non si torna piu' `null` — in produzione il
 * dominio e' noto, e un invito che arriva con l'indirizzo di Vercel (o peggio,
 * con localhost) e' un invito che nessuno apre.
 */
export function getAppBaseUrl(): string | null {
  const explicit =
    process.env.BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      // Valore malformato: si prosegue col ripiego invece di restituire null
      // e rompere ogni link in uscita.
    }
  }

  try {
    return new URL(fallbackAppOrigin()).origin;
  } catch {
    return null;
  }
}
