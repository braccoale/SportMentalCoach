'use client';

import { Sparkles } from 'lucide-react';
import type {
  CompassEvidence,
  SessionCompassReport,
} from '@/lib/core/ai-session-notes/session-compass-contract';
import { EvidenceButton, evidenceKey } from './ui';
import { NetworkDecor } from './decor';

/**
 * Blocco dominante della Panoramica.
 *
 * Non è una card: è la pagina. Prima aveva bordo, sfondo e ombra come le
 * altre quindici, e con un titolo da 20px competeva alla pari con riquadri
 * che valgono un decimo. Il risultato era che l'occhio non trovava dove
 * atterrare.
 *
 * Qui la gerarchia la fanno la dimensione del testo e lo spazio, non un
 * contenitore: il titolo domina, tutto il resto è chiaramente subordinato.
 * Problema centrale e prossimo passo restano, ma smettono di essere due
 * riquadri concorrenti e diventano una riga di appoggio.
 *
 * Nessuno dei testi viene inventato: quando il report non lo contiene, si
 * dichiara il dato assente.
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
  // La sintesi, non la risorsa emersa.
  //
  // L'eroe mostrava `emergingResource ?? summary`, e siccome una risorsa
  // emersa c'e' quasi sempre, la sintesi della seduta non compariva mai in
  // Panoramica: si apriva il riepilogo e non si trovava il riepilogo. Al
  // suo posto campeggiava una cosa concordata *dentro* la seduta, che e'
  // un dettaglio, non il suo racconto.
  const mainInsight = overview.summary || overview.emergingResource?.text;
  const emergingResource = overview.emergingResource?.text ?? null;
  const nextStep = report.nextSessionPrep[0] ?? report.commitments[0] ?? null;

  return (
    <section className="relative min-w-0 overflow-hidden px-1 pt-2 sm:px-2">
      {/* La rete accompagna il titolo dall'angolo, senza mai passarci sopra:
          resta fuori dai 46ch della colonna di testo. */}
      <NetworkDecor className="-right-16 -top-10 hidden size-72 opacity-90 lg:block" />

      <div className="relative flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">
          <Sparkles className="h-3.5 w-3.5" /> Lettura AI
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            isApproved
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-900'
          }`}
        >
          {isApproved ? 'Approvata dal coach' : 'Bozza da validare'}
        </span>
      </div>

      {/* La dimensione è il messaggio: questa è la frase che il coach deve
          leggere per prima, e deve essere impossibile leggerne un'altra
          prima di lei. */}
      <h3 className="relative mt-4 max-w-[46ch] text-[1.75rem] font-bold leading-[1.15] tracking-[-0.02em] text-gray-950 sm:text-[2.25rem] lg:text-[2.6rem]">
        {mainInsight || 'Dato non disponibile'}
      </h3>
      <p className="mt-3 text-xs leading-5 text-gray-500">
        Interpretazione da verificare da parte del coach, non un fatto
        accertato.
      </p>

      {primaryEvidence.length ? (
        <div className="mt-4 grid max-w-3xl gap-2 sm:grid-cols-2">
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

      {/* Una riga di appoggio separata da un filo, non due riquadri: erano
          la ragione principale per cui l'eroe non sembrava un eroe. */}
      <div
        className={`mt-6 grid gap-5 border-t border-gray-200/80 pt-5 ${
          emergingResource ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
        }`}
      >
        <SupportingFact
          label="Problema centrale"
          value={centralTheme?.text ?? 'Dato non disponibile'}
          note="Tema emerso dalla conversazione; non è una diagnosi."
        />
        <SupportingFact
          label="Prossimo passo suggerito"
          value={nextStep?.text ?? 'Dato non disponibile'}
          note={
            nextStep
              ? 'Da decidere e validare dal coach.'
              : 'Non è stata definita un’azione verificabile.'
          }
        />
        {emergingResource ? (
          <SupportingFact
            label="Risorsa emersa"
            value={emergingResource}
            note="Leva su cui l’atleta ha già mostrato di poter contare."
          />
        ) : null}
      </div>
    </section>
  );
}

function SupportingFact({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">
        {label}
      </p>
      <p className="mt-1.5 text-base font-bold leading-6 text-gray-950">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-gray-600">{note}</p>
    </div>
  );
}
