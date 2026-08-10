/**
 * Dominio pubblico di KaiPai.
 *
 * Vive in un modulo senza `server-only` perche' serve anche dove non c'e' un
 * ambiente server completo (build dei link, test): l'origine del prodotto e'
 * un fatto, non un dettaglio di runtime.
 */
export const CANONICAL_APP_URL = 'https://www.kaipaicoaching.com';

/**
 * Origine da usare nei link che escono dal prodotto quando non e' stata
 * configurata esplicitamente.
 *
 * In produzione e' il dominio vero; in preview e' il deploy corrente, cosi'
 * una prova non rimanda al sito pubblico; in locale resta localhost.
 */
export function fallbackAppOrigin(): string {
  if (process.env.VERCEL_ENV === 'production') return CANONICAL_APP_URL;
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;
  return 'http://localhost:3000';
}
