'use client';

import { BookOpen } from 'lucide-react';
import type { SessionStory } from '@/lib/core/ai-session-notes/session-compass-contract';
import { EvidenceReference, Surface, evidenceKey } from './ui';

/**
 * Il richiamo al racconto, dentro la Panoramica.
 *
 * Non ripete il racconto e non lo apre in un accordion: mostra il titolo e le
 * prime righe, quanto basta per decidere se leggerlo adesso. Un cruscotto
 * annuncia, non contiene.
 */
export function SessionStoryCta({
  story,
  onOpenStory,
  className = '',
}: {
  story: SessionStory | null;
  onOpenStory: () => void;
  className?: string;
}) {
  if (!story) return null;
  const opening = story.paragraphs[0]?.text ?? '';

  return (
    <Surface className={className} ariaLabel="Racconto della sessione">
      <button
        type="button"
        onClick={onOpenStory}
        className="group flex w-full items-start gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700">
          <BookOpen className="size-4.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          {/* Sopratitolo e titolo insieme: dentro una sezione richiudibile
              sono gia' scritti nell'intestazione che si clicca, e ripeterli
              costa spazio senza aggiungere niente. */}
          <span data-compass-heading className="block">
            <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">
              Com’è andata
            </span>
            <span className="mt-1 block text-lg font-bold leading-snug text-gray-950">
              {story.title}
            </span>
          </span>
          <span className="mt-2 line-clamp-2 block text-sm leading-6 text-gray-600">
            {opening}
          </span>
          <span className="mt-3 inline-block text-sm font-semibold text-violet-700 group-hover:underline">
            Leggi il racconto →
          </span>
        </span>
      </button>
    </Surface>
  );
}

/**
 * Il racconto della seduta, a tutta pagina.
 *
 * Sta in una tab sua e non dentro la Panoramica perché è l'unica parte del
 * report che si legge invece di consultarsi. La Panoramica è un cruscotto: ci
 * si passa sopra con lo sguardo. Qui ci si ferma, e la pagina deve
 * assecondarlo — una colonna stretta, righe alte, niente card che spezzano il
 * testo in riquadri.
 *
 * Le citazioni stanno a lato del capoverso che sostengono, non dentro: dentro
 * romperebbero la lettura, che è esattamente ciò che questa pagina protegge.
 */
export function SessionStoryPanel({
  story,
  onOpenEvidence,
}: {
  story: SessionStory | null;
  onOpenEvidence: (segmentId: number) => void;
}) {
  if (!story) {
    return (
      <Surface ariaLabel="Racconto della sessione">
        <p className="text-sm leading-6 text-gray-600">
          Il racconto compare quando il riepilogo è stato generato su una
          trascrizione completa. Se la sessione è appena finita, attendi la fine
          dell’elaborazione.
        </p>
      </Surface>
    );
  }

  return (
    <article className="mx-auto max-w-[68ch] px-1 py-2">
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">
        <BookOpen className="size-3.5" aria-hidden="true" />
        Com’è andata
      </p>
      <h2 className="mt-3 text-[1.6rem] font-bold leading-[1.2] tracking-tight text-gray-950 sm:text-[2rem]">
        {story.title}
      </h2>

      {story.throughLine ? (
        // Il filo con le sedute precedenti sta in cima: è la cosa che un
        // modello senza storico non potrebbe scrivere, e va vista subito.
        <p className="mt-5 border-l-2 border-violet-300 pl-4 text-base italic leading-7 text-gray-700">
          {story.throughLine}
        </p>
      ) : null}

      <div className="mt-7 space-y-6">
        {story.paragraphs.map((paragraph) => (
          <div key={paragraph.id}>
            <p className="text-[1.0625rem] leading-8 text-gray-800">
              {paragraph.text}
            </p>
            {paragraph.evidence ? (
              <div className="mt-2">
                <EvidenceReference
                  key={evidenceKey(paragraph.evidence)}
                  evidence={paragraph.evidence}
                  onOpenEvidence={onOpenEvidence}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </article>
  );
}
