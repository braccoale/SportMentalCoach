'use client';

import { ArrowRight, CalendarDays, Lightbulb, RotateCcw, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MentalJourneyEntry } from '@/lib/core/ai-session-notes/mental-journey';
import type { SessionCompassReport } from '@/lib/core/ai-session-notes/session-compass-contract';
import { formatJourneyDate } from './athlete-journey-sidebar';
import { compareJourneyThemes } from './journey-panel';
import { compareSessionMetrics, metricDeltaSentence } from './metric-model';
import { DashboardEmptyState, Pill, SectionHeading, Surface } from './ui';

const NEXT_ORIGIN_LABEL = {
  theme: 'Tema emerso',
  commitment: 'Impegno',
  open_question: 'Domanda aperta',
} as const;

const MAX_SUGGESTIONS = 2;

/** Azione della sessione precedente rimasta aperta, se ce n'è una. */
function openCommitmentTitle(previous: MentalJourneyEntry): string | null {
  const open = previous.commitments.find(
    (commitment) => commitment.status === 'pending' || commitment.status === 'in_progress'
  );
  return open?.title ?? null;
}

/**
 * Il cambiamento principale usa solo confronti reali: una metrica ordinale
 * comparabile, oppure un tema nuovo. Senza nessuno dei due, lo dichiara.
 */
function mainChange(report: SessionCompassReport, previous: MentalJourneyEntry | null): string {
  if (!previous) return 'Nessun confronto disponibile: è la prima sessione approvata.';
  const deltas = compareSessionMetrics(
    report.sessionOverview.metrics ?? [],
    previous.metrics ?? []
  );
  const moved = deltas.find((delta) => delta.direction !== 'stable');
  if (moved) return metricDeltaSentence(moved);
  const themes = compareJourneyThemes(
    report.sessionOverview.themes.map((theme) => theme.text),
    previous.themes
  );
  if (themes.newInCurrent.length) return `Nuovo tema: ${themes.newInCurrent[0]}`;
  if (deltas.length) return metricDeltaSentence(deltas[0]);
  return 'Non ci sono dati comparabili sufficienti per identificare un cambiamento.';
}

/**
 * Filo logico del percorso: da dove si veniva, cosa è successo oggi, dove si
 * potrebbe andare. Il terzo passaggio è esplicitamente una proposta.
 */
export function JourneyNarrative({
  report,
  previous,
  currentSessionDate,
  className = '',
}: {
  report: SessionCompassReport;
  previous: MentalJourneyEntry | null;
  currentSessionDate: string | null;
  className?: string;
}) {
  const suggestions = report.nextSessionPrep.slice(0, MAX_SUGGESTIONS);
  const openAction = previous ? openCommitmentTitle(previous) : null;

  return (
    <Surface className={className}>
      <SectionHeading eyebrow="Percorso" title="Filo logico del percorso" />

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-stretch">
        {previous ? (
          <Step
            icon={<RotateCcw className="h-4 w-4" />}
            step={1}
            label="Sessione precedente"
            date={formatJourneyDate(previous.sessionDate)}
            title={previous.focus ?? 'Focus non identificato'}
            text={previous.summary}
            footer={
              openAction ? (
                <p className="mt-2 text-xs leading-5 text-amber-900">
                  <span className="font-semibold">Azione lasciata aperta:</span> {openAction}
                </p>
              ) : null
            }
          />
        ) : (
          <DashboardEmptyState
            className="self-start"
            icon={
              // Lo stato vuoto occupa comunque il primo posto del flusso: senza
              // il numero la sequenza partirebbe da due.
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 text-[11px] font-bold text-gray-500"
                >
                  1
                </span>
                <RotateCcw className="h-4 w-4" />
              </span>
            }
            title="Nessuna sessione precedente approvata"
            description="Il filo logico parte dalla sessione attuale."
          />
        )}

        <StepArrow />

        <Step
          current
          icon={<Sparkles className="h-4 w-4" />}
          step={2}
          label="Sessione attuale"
          date={formatJourneyDate(currentSessionDate)}
          title={report.sessionOverview.themes[0]?.text ?? 'Problema centrale non identificato'}
          text={report.sessionOverview.emergingResource?.text ?? report.sessionOverview.summary}
          footer={
            <p className="mt-2 text-xs leading-5 text-gray-600">
              <span className="font-semibold">Cambiamento principale:</span> {mainChange(report, previous)}
            </p>
          }
        />

        <StepArrow />

        {suggestions.length ? (
          <Step
            proposed
            icon={<Lightbulb className="h-4 w-4" />}
            step={3}
            label="Prossima direzione suggerita"
            date={null}
            title={suggestions[0].text}
            text={suggestions[1]?.text ?? ''}
            footer={
              <div className="mt-2 flex flex-wrap gap-1.5">
                {suggestions.map((item) => (
                  <Pill key={item.id} tone="sky">
                    {NEXT_ORIGIN_LABEL[item.origin]}
                  </Pill>
                ))}
                <Pill tone="amber">Da validare dal coach</Pill>
              </div>
            }
          />
        ) : (
          <DashboardEmptyState
            className="self-start"
            icon={<Lightbulb className="h-4 w-4" />}
            title="Nessuna direzione proposta"
            description="Il report non contiene punti verificabili per la prossima sessione."
          />
        )}
      </div>
    </Surface>
  );
}

function StepArrow() {
  return (
    <ArrowRight className="mx-auto hidden h-5 w-5 self-center text-gray-300 lg:block" aria-hidden="true" />
  );
}

function Step({
  step,
  icon,
  label,
  date,
  title,
  text,
  footer,
  current = false,
  proposed = false,
}: {
  /** Il numero del passaggio: rende il flusso leggibile senza leggerlo. */
  step: 1 | 2 | 3;
  icon: ReactNode;
  label: string;
  date: string | null;
  title: string;
  text: string;
  footer?: ReactNode;
  current?: boolean;
  proposed?: boolean;
}) {
  return (
    <article
      className={`min-w-0 rounded-xl border p-4 ${
        proposed ? 'border-dashed border-sky-300 bg-sky-50/50' : current ? 'border-violet-200 bg-violet-50/60' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
        <span
          aria-hidden="true"
          className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            proposed
              ? 'bg-sky-100 text-sky-700'
              : current
                ? 'bg-violet-600 text-white'
                : 'bg-gray-200 text-gray-600'
          }`}
        >
          {step}
        </span>
        {icon}
        {label}
      </div>
      {date ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          {date}
        </p>
      ) : null}
      <p className="mt-2 line-clamp-2 text-sm font-bold leading-5 text-gray-950">{title}</p>
      {text ? <p className="mt-1 line-clamp-3 text-sm leading-6 text-gray-600">{text}</p> : null}
      {footer}
    </article>
  );
}
