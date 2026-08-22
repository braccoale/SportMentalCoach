import { Compass } from 'lucide-react';
import type { SharedSessionReport } from '@/lib/core/ai-session-notes/shared-report';

const giorno = new Intl.DateTimeFormat('it-IT', {
  dateStyle: 'long',
  timeZone: 'Europe/Rome',
});

/**
 * Quello che il coach ha scelto di condividere con l'atleta, dopo la seduta.
 *
 * **Che cosa non c'è, e non per dimenticanza**: nessuna citazione testuale,
 * nessun indicatore numerico, nessun momento chiave, nessuna nota del coach.
 * Il criterio è scritto in `buildSharedReport`, non qui: questo componente
 * disegna ciò che riceve e non ha modo di mostrare altro, perché il tipo che
 * gli arriva non lo contiene.
 *
 * Il tono è quello di una lettera, non di un referto. Chi legge sta leggendo
 * di sé, da solo, probabilmente sul telefono, magari la sera: la pagina non
 * deve somigliare a un risultato di laboratorio.
 */
export function SharedSessionReportPanel({
  report,
  coachName,
}: {
  report: SharedSessionReport;
  coachName: string | null;
}) {
  return (
    <section
      id="session-compass"
      aria-labelledby="riepilogo-condiviso"
      className="scroll-mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-50">
          <Compass className="h-5 w-5 text-violet-700" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2
            id="riepilogo-condiviso"
            className="text-lg font-bold tracking-tight text-gray-950"
          >
            {report.story?.title ?? 'Il riepilogo della sessione'}
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-gray-600">
            {coachName ? `${coachName} ha` : 'Il tuo coach ha'} condiviso questo
            riepilogo con te il {giorno.format(new Date(report.sharedAt))}.
          </p>
        </div>
      </div>

      {report.summary.trim() && (
        <p className="mt-5 text-[15px] leading-relaxed text-gray-800">
          {report.summary}
        </p>
      )}

      {report.story && report.story.paragraphs.length > 0 && (
        <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-gray-800">
          {report.story.paragraphs.map((testo, i) => (
            <p key={i}>{testo}</p>
          ))}
        </div>
      )}

      {report.story?.throughLine && (
        <p className="mt-5 border-l-2 border-violet-200 pl-4 text-[15px] italic leading-relaxed text-gray-700">
          {report.story.throughLine}
        </p>
      )}

      {report.themes.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
            Di che cosa avete parlato
          </h3>
          <ul className="mt-2 space-y-1.5">
            {report.themes.map((tema, i) => (
              <li key={i} className="flex gap-2 text-sm leading-6 text-gray-800">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-violet-400" />
                {tema}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.emergingResource && (
        <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
          <strong className="font-semibold">Una risorsa che hai già.</strong>{' '}
          {report.emergingResource}
        </p>
      )}

      {/* Trasparenza: chi legge deve sapere che il testo nasce da un sistema
          automatico e che una persona l'ha riletto prima di consegnarlo. Non
          e' una formula legale appiccicata in fondo — cambia come si legge
          tutto quello che sta sopra. */}
      <p className="mt-6 border-t border-gray-100 pt-4 text-xs leading-5 text-gray-500">
        Questo testo è preparato da un sistema di intelligenza artificiale a
        partire dalla registrazione della sessione, e{' '}
        {coachName ? `${coachName} l’ha` : 'il tuo coach l’ha'} riletto e
        approvato prima di condividerlo. Se qualcosa non ti corrisponde,
        parlane con {coachName ?? 'il tuo coach'}: può correggerlo.
      </p>
    </section>
  );
}
