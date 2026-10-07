/**
 * L'origine (schema + host) da cui arriva una richiesta, ricavata dalle
 * intestazioni. Modulo puro: le intestazioni le legge chi chiama.
 *
 * Serve ai link che **devono tornare sullo stesso sito da cui sono partiti**:
 * il recupero password usa il flusso PKCE, e il codice segreto della richiesta
 * sta in un cookie legato all'indirizzo di partenza. Se il link nella mail
 * riportasse su un altro indirizzo (`vercel.app` invece di `www`, o un
 * `BASE_URL` diverso), il cookie non ci sarebbe e il codice non si potrebbe
 * scambiare. Stessa scelta dell'accesso con Google.
 */
export function originFromHeaders(headers: {
  origin?: string | null;
  forwardedHost?: string | null;
  host?: string | null;
  forwardedProto?: string | null;
}): string | null {
  const origin = headers.origin?.trim();
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      // Un'origine malformata non è un'origine: si ripiega sull'host.
    }
  }
  const host = (headers.forwardedHost ?? headers.host)?.split(',')[0].trim();
  if (!host) return null;
  const proto = (headers.forwardedProto ?? 'https').split(',')[0].trim();
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return null;
  }
}
