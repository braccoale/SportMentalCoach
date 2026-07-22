'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';

/**
 * Click-to-load wrapper for a third-party video embed (YouTube / Vimeo).
 *
 * A plain `<iframe>` contacts Google or Vimeo the moment the page renders —
 * handing them the visitor's IP and letting them set cookies before any
 * consent, on a *public* page. That would make our cookie policy's "no
 * third-party tracking, so no banner" claim false.
 *
 * So nothing is requested until the visitor clicks: no iframe, no preview
 * image either (YouTube's own thumbnail is served by Google and would leak the
 * IP just the same). The placeholder is drawn locally, and the notice says
 * plainly what clicking implies.
 */
export function VideoEmbed({
  src,
  title,
  provider,
}: {
  src: string;
  title: string;
  /** Shown in the notice so the visitor knows who receives the request. */
  provider: string;
}) {
  const [loaded, setLoaded] = useState(false);

  if (loaded) {
    return (
      <div className="aspect-video overflow-hidden rounded-lg border border-gray-200">
        <iframe
          src={src}
          title={title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <button
        type="button"
        onClick={() => setLoaded(true)}
        aria-label={`Carica e riproduci: ${title}`}
        className="group flex aspect-video w-full flex-col items-center justify-center gap-3 bg-gray-900 transition-colors hover:bg-gray-800"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 transition-transform group-hover:scale-105">
          <Play className="ml-0.5 h-6 w-6 fill-white text-white" />
        </span>
        <span className="text-sm font-medium text-white">
          Guarda la presentazione
        </span>
      </button>
      <p className="bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-500">
        Il video è ospitato su {provider}. Caricandolo, {provider} riceverà il
        tuo indirizzo IP e potrà impostare cookie propri: per questo non lo
        carichiamo finché non lo scegli tu.
      </p>
    </div>
  );
}
