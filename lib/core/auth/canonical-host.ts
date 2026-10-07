/**
 * Chi apre il sito dall'indirizzo interno di Vercel (`*.vercel.app`) va portato
 * sul dominio vero.
 *
 * Sono lo stesso sito, ma per il browser sono due luoghi: i cookie di accesso
 * valgono per un indirizzo solo, e i ritorni da Google, da Stripe e dal reset
 * password devono essere autorizzati per ciascuno. Partire da `vercel.app` e
 * finire su `www` sembra «non sono più collegato».
 *
 * **Solo le pagine, mai le API.** I webhook e i lavori programmati possono
 * essere stati configurati su `vercel.app` (e un reindirizzamento fa perdere
 * l'intestazione di autorizzazione): per loro non cambia niente. E solo in
 * produzione: le anteprime dei branch vivono proprio su `*.vercel.app`.
 *
 * Modulo puro.
 */
export function canonicalRedirectTarget(input: {
  host: string | null | undefined;
  pathname: string;
  search: string;
  method: string;
  /** `process.env.VERCEL_ENV`: «production», «preview», «development» o vuoto. */
  vercelEnv: string | null | undefined;
  canonicalOrigin: string;
}): string | null {
  if (input.vercelEnv !== 'production') return null;
  const host = (input.host ?? '').split(':')[0].toLowerCase();
  if (!host.endsWith('.vercel.app')) return null;
  if (input.method !== 'GET' && input.method !== 'HEAD') return null;
  if (input.pathname === '/api' || input.pathname.startsWith('/api/')) return null;
  if (input.pathname.startsWith('/_next/')) return null;
  return `${input.canonicalOrigin.replace(/\/$/, '')}${input.pathname}${input.search}`;
}
