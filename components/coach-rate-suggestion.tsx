import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Clock,
  Coins,
  GraduationCap,
  Lightbulb,
  ScrollText,
  Star,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { RateExplanationDialog } from '@/components/rate-explanation-dialog';
import type { RateFactor, RateSuggestion } from '@/lib/core/rate-suggestion';

const euro = (n: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

const FACTOR_ICON: Record<RateFactor['key'], LucideIcon> = {
  experience: GraduationCap,
  hours: Clock,
  titles: ScrollText,
  rating: Star,
  athletes: Users,
  athleteLevel: BarChart3,
};

const NEXT_ICON: Record<RateFactor['key'], LucideIcon> = {
  experience: CalendarDays,
  hours: Clock,
  titles: ScrollText,
  rating: Star,
  athletes: Users,
  athleteLevel: BarChart3,
};

/**
 * Il riquadro «Tariffa suggerita» nelle pagine del coach (Servizi e
 * Pagamenti), come da disegno: in alto il titolo e la fascia oraria; a sinistra
 * le voci con la loro barra; a destra la tariffa consigliata e il prossimo
 * traguardo, con tre cose da fare e il pulsante per migliorare il profilo.
 * È un riferimento, non un obbligo: il testo lo dice e il prezzo lo decide il
 * coach. Compare solo al coach, mai all'atleta.
 */
export function CoachRateSuggestion({ suggestion }: { suggestion: RateSuggestion }) {
  const { level, score, factors, next } = suggestion;
  const actionFactors = next
    ? factors
        .filter((f) => f.earned < f.max)
        .sort((a, b) => b.max - b.earned - (a.max - a.earned))
        .slice(0, 3)
    : [];

  return (
    <section
      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
      aria-labelledby="tariffa-suggerita"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
            <Lightbulb className="h-7 w-7" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="tariffa-suggerita" className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-950">
              Tariffa suggerita
              <RateExplanationDialog levels={suggestion.levels} factors={factors} currentLevelKey={level.key} />
            </h2>
            <p className="mt-0.5 text-sm text-gray-600">
              Il tuo livello: <strong className="text-gray-950">{level.label}</strong> · Punteggio {score}/100
            </p>
          </div>
        </div>
        <div className="rounded-2xl bg-sky-50 px-4 py-3 sm:min-w-64">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-gray-600">Fascia di riferimento KaiPai</p>
            <RateExplanationDialog levels={suggestion.levels} factors={factors} currentLevelKey={level.key} size="sm" />
          </div>
          <p className="mt-0.5 text-xl font-bold text-gray-950">
            {euro(level.min)} – {euro(level.max)} <span className="text-base font-medium">/ ora</span>
          </p>
          <p className="text-xs text-gray-500">Il prezzo finale lo decidi tu.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ul className="order-2 space-y-4 lg:order-1 lg:flex lg:flex-col lg:justify-between lg:space-y-0">
          {factors.map((f) => {
            const Icon = FACTOR_ICON[f.key];
            const pct = f.skipped ? 0 : Math.round((f.earned / f.max) * 100);
            return (
              <li key={f.key} className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-gray-900">{f.label}</span>
                    {f.skipped ? (
                      <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                        Non ancora disponibile
                      </span>
                    ) : (
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                        {Math.round(f.earned)}/{f.max}
                      </span>
                    )}
                  </div>
                  <div
                    className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-gray-100"
                    role="progressbar"
                    aria-label={f.label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                  >
                    <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="order-1 space-y-4 lg:order-2">
          <div className="rounded-2xl bg-sky-50 p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-sky-700">
                Tariffa consigliata
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                <Coins className="h-5 w-5" aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-5xl font-extrabold tracking-tight text-gray-950">
              {euro(level.suggested)} <span className="text-xl font-medium text-gray-500">/ ora</span>
            </p>
            <p className="mt-3 flex items-center gap-2 text-sm text-gray-700">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" aria-hidden />
              Livello {level.label} · Punteggio {score}/100
            </p>
          </div>

          <div className="rounded-2xl bg-green-50 p-5">
            {next ? (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm text-green-700">
                      <Target className="h-4 w-4" aria-hidden /> Il tuo prossimo traguardo
                    </p>
                    <p className="mt-1 text-xl font-bold text-gray-950">Livello {next.level.label}</p>
                  </div>
                  <div className="shrink-0 sm:border-l sm:border-green-200 sm:pl-4">
                    <p className="text-xs text-gray-500">Ti mancano</p>
                    <p className="text-xl font-bold text-green-700">
                      {next.pointsMissing} {next.pointsMissing === 1 ? 'punto' : 'punti'}
                    </p>
                    <p className="text-xs text-gray-500">per raggiungere il prossimo livello.</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div
                    className="h-2.5 flex-1 overflow-hidden rounded-full bg-green-100"
                    role="progressbar"
                    aria-label="Avanzamento verso il prossimo livello"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={score}
                  >
                    <div className="h-full rounded-full bg-green-500" style={{ width: `${score}%` }} />
                  </div>
                  <span className="text-sm tabular-nums text-gray-700">{score}/100</span>
                </div>
                <div className="mt-4 border-t border-green-200 pt-4">
                  <p className="text-sm font-semibold text-gray-950">Come migliorare il tuo profilo:</p>
                  <ul className="mt-2 space-y-2">
                    {actionFactors.map((f) => {
                      const Icon = NEXT_ICON[f.key];
                      return (
                        <li key={f.key} className="flex items-center gap-3 text-sm text-gray-800">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-green-600 ring-1 ring-green-100">
                            <Icon className="h-4 w-4" aria-hidden />
                          </span>
                          {f.action}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <Link
                  href="/dashboard/coach/profile"
                  className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-green-600 text-sm font-semibold text-white transition-colors hover:bg-green-700"
                >
                  Migliora il tuo profilo <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </>
            ) : (
              <div>
                <p className="flex items-center gap-2 text-sm text-green-700">
                  <Target className="h-4 w-4" aria-hidden /> Livello massimo raggiunto
                </p>
                <p className="mt-1 text-sm text-gray-700">
                  Sei al livello più alto: la fascia di riferimento è quella in alto. Il prezzo lo decidi tu.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
