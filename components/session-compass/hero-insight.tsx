'use client';

import { Sparkles, Target } from 'lucide-react';
import type {
  CompassEvidence,
  SessionCompassReport,
} from '@/lib/core/ai-session-notes/session-compass-contract';
import { EvidenceButton, Surface, evidenceKey } from './ui';

/**
 * Blocco dominante della Panoramica.
 *
 * La lettura AI è il contenuto principale; problema centrale e prossimo passo
 * restano elementi secondari nello stesso blocco. Nessuno dei tre testi viene
 * inventato: quando il report non lo contiene, la card dichiara il dato assente.
 */
export function SessionHeroInsight({
  report,
  isApproved,
  primaryEvidence,
  onOpenEvidence,
}: {
  report: SessionCompassReport;
  isApproved: boolean;
  primaryEvidence: readonly CompassEvidence[];
  onOpenEvidence: (segmentId: number) => void;
}) {
  const overview = report.sessionOverview;
  const centralTheme = overview.themes[0] ?? null;
  const mainInsight = overview.emergingResource?.text ?? overview.summary;
  const nextStep = report.nextSessionPrep[0] ?? report.commitments[0] ?? null;

  return (
    <Surface tone="accent" className="overflow-hidden sm:p-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">
              <Sparkles className="h-3.5 w-3.5" /> Lettura AI
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
              }`}
            >
              {isApproved ? 'Approvata dal coach' : 'Bozza da validare'}
            </span>
          </div>

          <h3 className="mt-3 text-xl font-bold leading-8 tracking-tight text-gray-950 sm:text-2xl">
            {mainInsight || 'Dato non disponibile'}
          </h3>
          <p className="mt-2 text-xs leading-5 text-gray-500">
            Interpretazione da verificare da parte del coach, non un fatto accertato.
          </p>

          {primaryEvidence.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {primaryEvidence.map((evidence) => (
                <EvidenceButton
                  key={evidenceKey(evidence)}
                  evidence={evidence}
                  onOpenEvidence={onOpenEvidence}
                  className="mt-0"
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <SideCard
            tone="violet"
            icon={<Target className="h-4 w-4" />}
            label="Problema centrale"
            value={centralTheme?.text ?? 'Dato non disponibile'}
            note="Tema emerso dalla conversazione; non è una diagnosi."
          />
          <SideCard
            tone="sky"
            icon={<Sparkles className="h-4 w-4" />}
            label="Prossimo passo suggerito"
            value={nextStep?.text ?? 'Dato non disponibile'}
            note={
              nextStep
                ? 'Da decidere e validare dal coach.'
                : 'Non è stata definita un’azione verificabile.'
            }
          />
        </div>
      </div>
    </Surface>
  );
}

function SideCard({
  tone,
  icon,
  label,
  value,
  note,
}: {
  tone: 'violet' | 'sky';
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  const tones = {
    violet: 'border-violet-100 bg-white/90 text-violet-700',
    sky: 'border-sky-100 bg-sky-50/70 text-sky-800',
  };
  return (
    <div className={`min-w-0 rounded-xl border p-4 ${tones[tone]}`}>
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 line-clamp-3 text-base font-bold leading-6 text-gray-950">{value}</p>
      <p className="mt-1.5 text-xs leading-5 text-gray-600">{note}</p>
    </div>
  );
}
