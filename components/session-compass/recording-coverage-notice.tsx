import { AlertTriangle } from 'lucide-react';
import type { SessionCoverage } from '@/lib/core/ai-session-notes/recording-coverage';

/**
 * Dice su quanta seduta è costruito il riepilogo, quando non è tutta.
 *
 * Era un riquadro giallo largo quanto la pagina, e occupava spazio sopra la
 * cosa che si è venuti a leggere. Ora è un contrassegno di una riga: il
 * dettaglio — quali voci mancano e per quanti minuti — sta nel fumetto, dove
 * lo trova chi ha bisogno del numero preciso.
 *
 * Resta però **prima** del riepilogo e non dopo, e resta impossibile da
 * chiudere. Sapere che una voce manca per quaranta minuti cambia come si legge
 * ogni riga di ciò che segue — percentuali di partecipazione, temi, momenti
 * chiave — e metterlo in fondo significherebbe farlo leggere a chi si è già
 * fatto un'idea.
 */
export function RecordingCoverageNotice({
  coverage,
}: {
  coverage: SessionCoverage;
}) {
  if (!coverage.hasGap) return null;

  return (
    <p
      role="status"
      title={`${coverage.notice} Le percentuali di partecipazione e i temi riguardano solo la parte registrata.`}
      className="mb-3 inline-flex cursor-help items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Registrazione incompleta
    </p>
  );
}
