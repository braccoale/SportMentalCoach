import { renderLlmsTxt } from '@/lib/core/seo/llms-txt';

/**
 * Servito come rotta e non come file statico in `public/` per una ragione
 * sola: cosi' l'indirizzo del sito viene da `lib/core/site.ts` invece di
 * essere ribattuto a mano dentro un file che nessuno rilegge mai.
 */
export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(renderLlmsTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, must-revalidate',
    },
  });
}
