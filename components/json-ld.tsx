import { serializeJsonLd, type JsonLdNode } from '@/lib/core/seo';

/**
 * Stampa uno o piu' nodi schema.org come singolo blocco JSON-LD.
 *
 * La serializzazione — con l'escape che impedisce a una stringa di chiudere il
 * tag — sta in `lib/core/seo`, dove ha un test accanto. Qui resta solo il tag.
 */
export function JsonLd({ nodes }: { nodes: JsonLdNode[] }) {
  if (nodes.length === 0) return null;

  return (
    <script type="application/ld+json">{serializeJsonLd(nodes)}</script>
  );
}
