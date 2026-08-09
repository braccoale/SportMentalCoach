'use client';

import { Ear } from 'lucide-react';
import type { MissedOpportunity } from '@/lib/core/ai-session-notes/session-compass-contract';
import { EvidenceReference, SectionHeading, Surface, evidenceKey } from './ui';

/**
 * I passaggi dell'atleta rimasti senza seguito.
 *
 * È l'unica sezione del riepilogo che parla del lavoro del coach invece che
 * dell'atleta, e questo cambia tutto nel modo di presentarla. Non è un
 * rimprovero: nel momento quelle frasi sembravano di passaggio, e
 * riascoltandosi non ci si accorge. È materiale per la prossima seduta.
 *
 * Per questo l'accento non è rosso e il titolo non parla di errori: la
 * domanda da riprendere è in evidenza, non la cosa non fatta.
 */
export function MissedOpportunities({
  items,
  citedEvidenceKeys,
  onOpenEvidence,
}: {
  items: readonly MissedOpportunity[];
  citedEvidenceKeys?: Set<string>;
  onOpenEvidence: (segmentId: number) => void;
}) {
  if (items.length === 0) return null;

  return (
    <Surface tone="muted" ariaLabel="Spunti rimasti aperti">
      <div className="flex items-start gap-3">
        <Ear className="mt-0.5 size-5 shrink-0 text-violet-600" aria-hidden="true" />
        <div className="min-w-0">
          <SectionHeading
            eyebrow="Da riascoltare"
            title="Spunti rimasti aperti"
            description="Passaggi in cui l’atleta ha aperto qualcosa e la conversazione è andata altrove. Materiale per la prossima seduta."
          />
        </div>
      </div>

      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-xl border border-gray-200/70 bg-white p-3.5"
          >
            <p className="text-sm leading-6 text-gray-600">{item.text}</p>
            {/* La domanda è la cosa che serve davvero: sta in evidenza, non
                l'occasione persa. */}
            <p className="mt-2 text-sm font-bold leading-6 text-gray-950">
              {item.followUp}
            </p>
            <EvidenceReference
              evidence={item.evidence}
              alreadyCited={citedEvidenceKeys?.has(evidenceKey(item.evidence)) ?? false}
              onOpenEvidence={onOpenEvidence}
              className="mt-1.5"
            />
          </li>
        ))}
      </ul>
    </Surface>
  );
}
