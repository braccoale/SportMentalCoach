import { AlertTriangle } from 'lucide-react';
import type { SessionCoverage } from '@/lib/core/ai-session-notes/recording-coverage';

/**
 * Dice su quanta seduta è costruito il riepilogo, quando non è tutta.
 *
 * Sta **sopra** il report e non in fondo: sapere che una voce manca per
 * quaranta minuti cambia come si legge ogni riga di ciò che segue —
 * percentuali di partecipazione, temi, momenti chiave. Metterlo dopo
 * significherebbe farlo leggere a chi si è già fatto un'idea.
 *
 * Non blocca niente e non si può chiudere: una seduta a metà è comunque
 * materiale utile, ma non deve poter passare per completa.
 */
export function RecordingCoverageNotice({
  coverage,
}: {
  coverage: SessionCoverage;
}) {
  if (!coverage.hasGap) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
    >
      <AlertTriangle
        className="mt-0.5 size-5 shrink-0 text-amber-700"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-sm font-bold text-amber-900">
          Registrazione incompleta
        </p>
        <p className="mt-1 text-sm leading-6 text-amber-900">
          {coverage.notice}
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-800">
          Le percentuali di partecipazione e i temi riguardano solo la parte
          registrata.
        </p>
      </div>
    </div>
  );
}
