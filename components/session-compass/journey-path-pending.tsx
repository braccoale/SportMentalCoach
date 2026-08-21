import Link from 'next/link';
import { ArrowRight, Compass, Route } from 'lucide-react';

/**
 * Quello che sta al posto della striscia quando un percorso non c'è ancora.
 *
 * Non è un riquadro di cortesia: è la risposta alla domanda che si fa chi
 * apre la scheda e non trova il percorso. Due sedute sono il minimo per
 * disegnare una linea — con un punto solo non c'è un «da dove a dove» — ma
 * l'assenza va detta, non lasciata come un buco fra l'intestazione e i
 * riquadri.
 *
 * E soprattutto: quasi sempre il percorso non manca perché mancano le sedute,
 * manca perché mancano le **approvazioni**. Un riepilogo in attesa non entra
 * nel percorso, e finora nessuna schermata lo diceva. Quando ce ne sono, qui
 * si trasforma un vicolo cieco in una cosa da fare.
 */
export function JourneyPathPending({
  approvedSessions,
  awaitingReview,
  reviewHref,
  mentalJourneyHref,
}: {
  approvedSessions: number;
  /** Riepiloghi pronti che aspettano il coach. */
  awaitingReview: number;
  /** Dove si va a validare, quando c'è qualcosa da validare. */
  reviewHref: string | null;
  mentalJourneyHref: string;
}) {
  const title =
    approvedSessions === 0
      ? 'Il percorso non è ancora cominciato'
      : 'Ancora una seduta, e il percorso prende forma';

  const explanation =
    approvedSessions === 0
      ? 'Il percorso si costruisce dai riepiloghi delle sedute che approvi: è l’approvazione a farli entrare qui.'
      : `C’è una sola seduta approvata. Una linea ha bisogno di due punti: da dove si è partiti e dove si è adesso.`;

  return (
    <section className="rounded-2xl border border-gray-200/70 bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-50">
          <Route className="h-4.5 w-4.5 text-violet-600" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight text-gray-900">
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-600">
            {explanation}
          </p>

          {/* La riga che vale davvero: un riepilogo pronto e non approvato è
              lavoro già fatto dall'AI che nessuno vede. */}
          {awaitingReview > 0 && reviewHref && (
            <p className="mt-3 rounded-xl bg-violet-50/70 px-3.5 py-2.5 text-sm text-violet-900">
              {awaitingReview === 1
                ? 'C’è 1 riepilogo pronto che aspetta la tua validazione. Approvarlo è ciò che lo fa entrare nel percorso.'
                : `Ci sono ${awaitingReview} riepiloghi pronti che aspettano la tua validazione. Approvarli è ciò che li fa entrare nel percorso.`}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {awaitingReview > 0 && reviewHref && (
              <Link
                href={reviewHref}
                className="group inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              >
                <Compass className="h-4 w-4" aria-hidden="true" />
                {awaitingReview === 1 ? 'Valida il riepilogo' : 'Valida i riepiloghi'}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
            {approvedSessions > 0 && (
              <Link
                href={mentalJourneyHref}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              >
                Apri il percorso mentale
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
