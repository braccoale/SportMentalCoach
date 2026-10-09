import { Lightbulb } from 'lucide-react';
import type { RateSuggestion } from '@/lib/core/rate-suggestion';

const euro = (n: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

/**
 * Il riquadro «Tariffa suggerita» nella pagina dei servizi del coach: il
 * livello, la fascia oraria, il perché (voce per voce) e cosa lo farebbe
 * salire. È un riferimento KaiPai, non un prezzo di mercato e non un obbligo:
 * il testo lo dice, e il prezzo lo sceglie sempre il coach.
 */
export function CoachRateSuggestion({ suggestion }: { suggestion: RateSuggestion }) {
  const { level, score, factors, next } = suggestion;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="tariffa-suggerita">
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" aria-hidden />
        <div className="min-w-0">
          <h2 id="tariffa-suggerita" className="text-lg font-medium text-gray-900">
            Tariffa suggerita
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Il tuo livello: <strong>{level.label}</strong>. Fascia di riferimento KaiPai{' '}
            <strong>
              {euro(level.min)}–{euro(level.max)}
            </strong>{' '}
            l’ora, suggerito <strong>{euro(level.suggested)}</strong>. È un aiuto: il prezzo lo
            decidi tu.
          </p>
        </div>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-gray-700 underline-offset-2 hover:underline">
          Come l’abbiamo calcolata ({score}/100)
        </summary>
        <ul className="mt-2 space-y-1.5">
          {factors.map((f) => (
            <li key={f.key} className="flex items-baseline justify-between gap-3 text-gray-600">
              <span>{f.label}</span>
              <span className="shrink-0 tabular-nums text-gray-500">
                {f.skipped ? 'non ancora conteggiata' : `${Math.round(f.earned)}/${f.max}`}
              </span>
            </li>
          ))}
        </ul>
        {next && (
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-gray-600">
            <p>
              Per passare a <strong>{next.level.label}</strong> mancano circa {next.pointsMissing}{' '}
              punti. Cosa aiuta di più:
            </p>
            <ul className="mt-1 list-disc pl-5">
              {next.hints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-3 text-xs text-gray-500">
          Usiamo solo fatti sul tuo lavoro: esperienza, ore erogate, titoli, valutazioni, atleti
          seguiti e loro livello. Non usiamo i prezzi degli altri coach.
        </p>
      </details>
    </section>
  );
}
