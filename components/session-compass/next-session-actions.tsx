'use client';

import { ListChecks } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SessionCompassReport } from '@/lib/core/ai-session-notes/session-compass-contract';
import { EvidenceReference, Pill, SectionHeading, Surface } from './ui';

const NEXT_SESSION_ORIGIN_LABEL = {
  theme: 'Tema emerso',
  commitment: 'Impegno',
  open_question: 'Domanda aperta',
} as const;

const MAX_VISIBLE = 3;

/**
 * Checklist compatta: una riga per azione, evidenza raggiungibile con un
 * riferimento breve. Nessun controllo nuovo — la gestione persistente resta
 * negli Appunti coach, dove gli impegni sono realmente salvati.
 */
export function NextSessionActions({
  items,
  isApproved,
  onOpenEvidence,
  onOpenNotes,
  className = '',
}: {
  items: SessionCompassReport['nextSessionPrep'];
  isApproved: boolean;
  onOpenEvidence: (segmentId: number) => void;
  onOpenNotes: () => void;
  className?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  if (!items.length) return null;
  const visibleItems = showAll ? items : items.slice(0, MAX_VISIBLE);

  return (
    <Surface className={`border-sky-200 bg-sky-50/40 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading eyebrow="Follow-up" title="Da riprendere nella prossima sessione" />
        <Button type="button" variant="outline" size="sm" onClick={onOpenNotes}>
          Gestisci
        </Button>
      </div>

      <ol className="mt-4 space-y-2">
        {visibleItems.map((item) => (
          <li key={item.id} className="rounded-xl border border-sky-100 bg-white p-3">
            <div className="flex gap-2.5">
              <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold leading-6 text-gray-950">
                  {item.text}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Pill tone="sky">{NEXT_SESSION_ORIGIN_LABEL[item.origin]}</Pill>
                  <Pill>{isApproved ? 'Report approvato' : 'Da verificare dal coach'}</Pill>
                  <EvidenceReference
                    evidence={item.evidence}
                    onOpenEvidence={onOpenEvidence}
                    className="mt-0"
                  />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {items.length > MAX_VISIBLE ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          aria-expanded={showAll}
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? 'Mostra meno' : 'Vedi tutte'}
        </Button>
      ) : null}
    </Surface>
  );
}
