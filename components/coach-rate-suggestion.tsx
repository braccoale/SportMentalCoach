'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Clock,
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
 * Pagamenti). Di default è una riga sola, che dice l'essenziale: il livello, il
 * prezzo suggerito, la fascia e il punteggio. «Dettagli» apre il perché (le
 * voci con la loro barra) e il prossimo traguardo, con tre cose da fare e il
 * pulsante per migliorare il profilo. L'icona (i) spiega come si calcola.
 *
 * È un riferimento, non un obbligo: il testo lo dice e il prezzo lo decide il
 * coach. Compare solo al coach, mai all'atleta.
 */
export function CoachRateSuggestion({ suggestion }: { suggestion: RateSuggestion }) {
  const { level, score, factors, next } = suggestion;
  const [open, setOpen] = useState(false);
  const actionFactors = next
    ? factors
        .filter((f) => f.earned < f.max)
        .sort((a, b) => b.max - b.earned - (a.max - a.earned))
        .slice(0, 3)
    : [];

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:px-5"
      aria-labelledby="tariffa-suggerita"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
          <Lightbulb className="h-5 w-5" aria-hidden />
        </span>
        <div className="mr-auto min-w-0">
          <h2 id="tariffa-suggerita" className="flex items-center gap-1.5 text-base font-semibold text-gray-950">
            Tariffa suggerita
            <RateExplanationDialog levels={suggestion.levels} factors={factors} currentLevelKey={level.key} size="sm" />
          </h2>
          <p className="text-xs text-gray-500">
            Livello <strong className="text-gray-800">{level.label}</strong> · fascia {euro(level.min)}–{euro(level.max)}{' '}
            / ora · punteggio {score}/100 · il prezzo lo decidi tu
          </p>
        </div>
        <p className="shrink-0 text-2xl font-extrabold tracking-tight text-gray-950">
          {euro(level.suggested)} <span className="text-sm font-medium text-gray-500">/ ora</span>
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="tariffa-dettagli"
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-emerald-700 hover:underline"
        >
          Dettagli
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>

      {open && (
        <div id="tariffa-dettagli" className="mt-4 grid gap-5 border-t border-gray-100 pt-4 lg:grid-cols-2">
          <ul className="order-2 space-y-3 lg:order-1">
            {factors.map((f) => {
              const Icon = FACTOR_ICON[f.key];
              const pct = f.skipped ? 0 : Math.round((f.earned / f.max) * 100);
              return (
                <li key={f.key} className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                    <Icon className="h-4 w-4" aria-hidden />
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
                      className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100"
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

          <div className="order-1 rounded-xl bg-green-50 p-4 lg:order-2">
            {next ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm text-green-700">
                      <Target className="h-4 w-4" aria-hidden /> Il tuo prossimo traguardo
                    </p>
                    <p className="mt-0.5 text-lg font-bold text-gray-950">Livello {next.level.label}</p>
                  </div>
                  <p className="shrink-0 text-right text-sm text-gray-600">
                    Ti mancano{' '}
                    <strong className="text-green-700">
                      {next.pointsMissing} {next.pointsMissing === 1 ? 'punto' : 'punti'}
                    </strong>
                  </p>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div
                    className="h-2 flex-1 overflow-hidden rounded-full bg-green-100"
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
                <p className="mt-3 text-sm font-semibold text-gray-950">Come migliorare il tuo profilo:</p>
                <ul className="mt-1.5 space-y-1.5">
                  {actionFactors.map((f) => {
                    const Icon = NEXT_ICON[f.key];
                    return (
                      <li key={f.key} className="flex items-center gap-2.5 text-sm text-gray-800">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-green-600 ring-1 ring-green-100">
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        {f.action}
                      </li>
                    );
                  })}
                </ul>
                <Link
                  href="/dashboard/coach/profile"
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-green-600 text-sm font-semibold text-white transition-colors hover:bg-green-700"
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
                  Sei al livello più alto: la fascia di riferimento è quella indicata sopra. Il prezzo lo decidi tu.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
