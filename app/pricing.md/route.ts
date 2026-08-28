import { renderPricingMarkdown } from '@/lib/core/pricing/markdown';

/**
 * Il listino generato dagli stessi dati che rendono la sezione «Pacchetti»
 * della landing. Se un giorno i due divergono, e' perche' qualcuno ha
 * duplicato l'array: non succede finche' entrambi leggono
 * `lib/core/pricing`.
 */
export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(renderPricingMarkdown(), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, must-revalidate',
    },
  });
}
