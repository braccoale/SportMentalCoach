import Link from 'next/link';
import { CheckCircle2, Circle, CircleDot, Sparkles } from 'lucide-react';
import {
  COMPLETENESS_LEVEL_LABEL,
  type CompletenessItem,
  type ProfileCompleteness,
} from '@/lib/core/coach-profile/completeness';

/** Dove si sistema ogni voce: la pagina dei servizi o il modulo del profilo. */
const HREF_BY_KEY: Record<string, string> = {
  service: '/dashboard/coach/services',
  availability: '/dashboard/coach/services',
};

const LEVEL_TONE: Record<string, string> = {
  base: 'bg-gray-100 text-gray-700',
  buono: 'bg-amber-100 text-amber-800',
  ottimo: 'bg-emerald-100 text-emerald-800',
  completo: 'bg-emerald-600 text-white',
};

function hrefFor(item: CompletenessItem): string {
  return HREF_BY_KEY[item.key] ?? '#onboarding-profilo';
}

function Points({ item }: { item: CompletenessItem }) {
  const missing = Math.round(item.weight - item.earned);
  return (
    <span className="shrink-0 text-xs font-medium text-gray-500">
      {item.state === 'done' ? `${item.weight}/${item.weight}` : `+${missing} punti`}
    </span>
  );
}

/**
 * «Quanto è completo il tuo profilo»: la percentuale, il livello, cosa fare
 * adesso (le voci che fanno guadagnare di più, con il perché) e l'elenco
 * completo. Spiega anche il valore di un profilo ricco: compari nei filtri
 * degli atleti e, a parità di attività, più in alto nell'elenco.
 *
 * Non promette numeri che non abbiamo misurato (nessun «+X% di richieste»): i
 * motivi sono quelli che il prodotto fa davvero.
 */
export function CoachProfileCompleteness({
  completeness,
}: {
  completeness: ProfileCompleteness;
}) {
  const { score, level, items, nextSteps } = completeness;

  return (
    <section
      aria-labelledby="completezza-profilo"
      className="rounded-lg border border-gray-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="completezza-profilo" className="text-lg font-medium text-gray-900">
            Quanto è completo il tuo profilo
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">
            Più informazioni metti, più è facile che un atleta ti trovi e ti scelga.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold tabular-nums text-gray-900">{score}%</span>
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${LEVEL_TONE[level]}`}
          >
            {COMPLETENESS_LEVEL_LABEL[level]}
          </span>
        </div>
      </div>

      <div
        className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Completezza del profilo"
      >
        <div
          className="h-full rounded-full bg-emerald-600 transition-all"
          style={{ width: `${score}%` }}
        />
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
        <p>
          <strong className="font-semibold">Perché conviene.</strong> Gli atleti filtrano
          per sport, specialità, livello e lingua: se un campo è vuoto, non compari in
          quei risultati. Un profilo completo compare in più ricerche e, a parità di
          attività, più in alto nell’elenco dei coach.
        </p>
      </div>

      {nextSteps.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-gray-900">Cosa fare adesso</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {nextSteps.map((item) => (
              <li key={item.key}>
                <Link
                  href={hrefFor(item)}
                  className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
                >
                  <CircleDot
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-gray-900">{item.label}</span>
                      <Points item={item} />
                    </span>
                    <span className="mt-0.5 block text-sm text-gray-700">{item.hint}</span>
                    <span className="mt-1 block text-xs text-gray-500">{item.why}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-5 text-sm font-medium text-emerald-800">
          Il tuo profilo è completo: non c’è niente da aggiungere. Tienilo aggiornato.
        </p>
      )}

      <details className="group mt-5">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
          Tutte le voci ({items.filter((i) => i.state === 'done').length}/{items.length})
        </summary>
        <ul className="mt-2 flex flex-col divide-y divide-gray-100">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-3 py-2">
              {item.state === 'done' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              ) : item.state === 'partial' ? (
                <CircleDot className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
              )}
              <span
                className={`flex-1 text-sm ${
                  item.state === 'done' ? 'text-gray-900' : 'text-gray-600'
                }`}
              >
                {item.label}
              </span>
              <Points item={item} />
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
