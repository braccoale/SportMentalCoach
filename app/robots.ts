import type { MetadataRoute } from 'next';
import { CANONICAL_APP_URL } from '@/lib/core/site';

/**
 * Nessun crawler e' bloccato per nome, nemmeno quelli dei modelli: GPTBot,
 * ClaudeBot, PerplexityBot e Google-Extended ricadono nella regola generica e
 * possono leggere. E' una scelta, non una dimenticanza — un motore che non
 * legge una pagina non puo' citarla.
 *
 * `/pricing.md` e `/llms.txt` hanno un `Allow` esplicito perche' `Disallow`
 * lavora per prefisso: la riga che nasconde la pagina di abbonamento
 * `/pricing` coprirebbe anche `/pricing.md`, che invece esiste apposta per
 * essere letto da un agente. Vince la regola piu' specifica, e per ottenerla
 * bisogna scriverla.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/pricing.md', '/llms.txt'],
      disallow: [
        '/api/',
        '/auth/',
        '/dashboard/',
        '/invita/',
        '/onboarding/',
        '/pricing',
        '/reset-password/',
        '/sign-in',
        '/sign-up',
        '/tutore/',
        '/video/',
      ],
    },
    host: CANONICAL_APP_URL,
    sitemap: `${CANONICAL_APP_URL}/sitemap.xml`,
  };
}
