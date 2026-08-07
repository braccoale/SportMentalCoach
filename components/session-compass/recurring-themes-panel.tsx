'use client';

import { Repeat, Target } from 'lucide-react';
import type { RecurringTheme } from '@/lib/core/ai-session-notes/mental-journey';
import type { CompassTheme } from '@/lib/core/ai-session-notes/session-compass-contract';
import { formatJourneyDate } from './athlete-journey-sidebar';
import { DashboardEmptyState, EvidenceReference, SectionHeading, Surface, evidenceKey } from './ui';

const MAX_VISIBLE = 3;

/**
 * Con uno storico approvato la card mostra le ricorrenze reali; con una sola
 * sessione cambia titolo e mostra i temi della sessione, senza simulare
 * ricorrenze che i dati non contengono.
 */
export function RecurringThemesPanel({
  recurringThemes,
  sessionThemes,
  citedEvidenceKeys,
  onOpenEvidence,
  className = '',
}: {
  recurringThemes: readonly RecurringTheme[];
  sessionThemes: readonly CompassTheme[];
  citedEvidenceKeys: ReadonlySet<string>;
  onOpenEvidence: (segmentId: number) => void;
  className?: string;
}) {
  const recurring = recurringThemes.slice(0, MAX_VISIBLE);

  if (recurring.length) {
    return (
      <Surface className={className}>
        <SectionHeading eyebrow="Percorso" title="Temi ricorrenti" />
        <ul className="mt-4 space-y-2">
          {recurring.map((theme) => (
            <li key={theme.key} className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
              <div className="flex items-start gap-2.5">
                <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-bold leading-5 text-gray-950">{theme.label}</p>
                  <p className="mt-1 text-xs font-semibold text-gray-600">
                    {theme.occurrences} sessioni · ultima {formatJourneyDate(theme.lastSeenAt)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Surface>
    );
  }

  return (
    <Surface className={className}>
      <SectionHeading eyebrow="Su cosa avete lavorato" title="Temi della sessione" />
      {sessionThemes.length ? (
        <ul className="mt-4 space-y-2">
          {sessionThemes.slice(0, MAX_VISIBLE).map((theme) => (
            <li key={theme.id} className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
              <div className="flex items-start gap-2.5">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-bold leading-5 text-gray-950">{theme.text}</p>
                  <EvidenceReference
                    evidence={theme.evidence}
                    alreadyCited={citedEvidenceKeys.has(evidenceKey(theme.evidence))}
                    onOpenEvidence={onOpenEvidence}
                    className="mt-1"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <DashboardEmptyState
          className="mt-4"
          icon={<Target className="h-4 w-4" />}
          title="Nessun tema con evidenza sufficiente"
          description="Il report non identifica temi ancorati alla trascrizione."
        />
      )}
    </Surface>
  );
}
