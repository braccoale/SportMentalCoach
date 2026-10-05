import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { HTML_LIMITED_BOT_UA_RE_STRING } from 'next/dist/shared/lib/router/utils/is-bot';

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

/**
 * Crawler che non eseguono JavaScript e che vogliono titolo, descrizione e
 * canonical dentro `<head>`.
 *
 * Next, con il rendering parziale attivo, invia i metadati in coda al
 * documento: sulla home il `<title>` stava alla posizione 136.000, `</head>`
 * alla 3.500. Googlebot esegue JavaScript e lo gestisce; i crawler dei modelli
 * linguistici no, e leggono la pagina com'è arrivata. Next serve i metadati
 * nell'`<head>` solo ai bot elencati in `htmlLimitedBots`.
 *
 * Il valore personalizzato SOSTITUISCE l'elenco predefinito (Bing, Facebook,
 * LinkedIn, WhatsApp…), non lo estende: per questo si parte da quello e si
 * aggiungono i crawler AI, altrimenti si toglierebbero quelli che oggi
 * funzionano. L'elenco va aggiornato quando ne nasce uno nuovo.
 */
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'DuckAssistBot',
  'CCBot',
  'Amazonbot',
  'Bytespider',
  'cohere-ai',
  'meta-externalagent',
];

const nextConfig: NextConfig = {
  // Local Windows builds can skip Next's child-process type checker after the
  // standalone `tsc --noEmit` check has passed. CI/Vercel keep it enabled.
  typescript: {
    ignoreBuildErrors: process.env.NEXT_SKIP_BUILD_TYPECHECK === '1',
  },
  htmlLimitedBots: new RegExp(`${HTML_LIMITED_BOT_UA_RE_STRING}|${AI_CRAWLERS.join('|')}`, 'i'),
  experimental: {
    ppr: true,
    clientSegmentCache: true
  }
};

export default withNextIntl(nextConfig);
