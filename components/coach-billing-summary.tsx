import Link from 'next/link';
import {
  COACH_ATHLETE_FILTERS,
  type CoachAthleteFilter,
  type CoachAthletesSummary,
} from '@/lib/core/billing/coach-athlete-status';
import { cn } from '@/lib/utils';

const FILTER_LABEL: Record<CoachAthleteFilter, string> = {
  'da-pianificare': 'Da pianificare',
  'in-ritardo': 'Pagamento in ritardo',
  'in-scadenza': 'In scadenza',
};

const FILTER_HINT: Record<CoachAthleteFilter, string> = {
  'da-pianificare':
    'Atleti con sedute del piano o sessioni singole ancora da prenotare.',
  'in-ritardo': 'Atleti il cui ultimo pagamento non è andato a buon fine.',
  'in-scadenza':
    'Rinnovo vicino con sedute da pianificare, abbonamento che termina o sessione singola in scadenza.',
};

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: 'warn';
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p
        className={cn(
          'text-2xl font-bold',
          tone === 'warn' && value > 0 ? 'text-amber-700' : 'text-gray-900'
        )}
      >
        {value}
      </p>
      <p className="text-xs text-gray-600">{label}</p>
    </div>
  );
}

/**
 * In cima a «I miei atleti»: quanti abbonati hai, quante sedute restano da
 * pianificare, chi è in ritardo con il pagamento, e i filtri per arrivare
 * subito a chi richiede attenzione. Compare solo se almeno un atleta ha un
 * abbonamento o sedute acquistate a parte.
 */
export function CoachBillingSummary({
  summary,
  active,
}: {
  summary: CoachAthletesSummary;
  active: CoachAthleteFilter | null;
}) {
  return (
    <div className="mt-5 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={summary.subscribers} label="Abbonati attivi" />
        <Stat value={summary.toPlan} label="Sedute da pianificare" />
        <Stat value={summary.pastDue} label="Pagamenti in ritardo" tone="warn" />
        <Stat
          value={summary.needAttention}
          label="Atleti da seguire"
          tone="warn"
        />
      </div>
      <nav aria-label="Filtra gli atleti" className="flex flex-wrap items-center gap-2">
        <Link
          href="/dashboard/coach/athletes"
          aria-current={active === null ? 'page' : undefined}
          className={cn(
            'rounded-full border px-3 py-1.5 text-sm font-medium transition',
            active === null
              ? 'border-gray-900 bg-gray-900 text-white'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
          )}
        >
          Tutti
        </Link>
        {COACH_ATHLETE_FILTERS.map((filter) => (
          <Link
            key={filter}
            href={`/dashboard/coach/athletes?filtro=${filter}`}
            title={FILTER_HINT[filter]}
            aria-current={active === filter ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition',
              active === filter
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            )}
          >
            {FILTER_LABEL[filter]}
          </Link>
        ))}
      </nav>
    </div>
  );
}
