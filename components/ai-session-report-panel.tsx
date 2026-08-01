'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type {
  AiSessionReport,
  EvidenceBackedItem,
  EvidenceBackedText,
  SafetyFlag,
  SuggestedItem,
} from '@/lib/core/ai-session-notes/session-report-contract';

type TranscriptTurn = {
  turnIndex: number;
  speakerLabel: string;
  startMs: number;
  endMs: number;
  text: string;
};

type AiSessionReportPanelProps = {
  sessionId: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function apiErrorMessage(value: unknown): string {
  if (isRecord(value) && typeof value.error === 'string') {
    return value.error;
  }
  return 'Non è stato possibile completare la richiesta. Riprova.';
}

async function requestJson(url: string, method: 'GET' | 'POST') {
  const response = await fetch(url, { method, credentials: 'same-origin' });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload));
  }
  return payload;
}

function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function sourceTurns(sourceTurnIndexes: readonly number[]): string {
  return `Riferimenti: interventi ${sourceTurnIndexes.join(', ')}`;
}

function EvidenceList({ items }: { items: readonly EvidenceBackedItem[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl bg-gray-50 p-3 text-sm text-gray-800">
          <p>{item.text}</p>
          <p className="mt-1 text-xs font-medium text-gray-500">
            {sourceTurns(item.sourceTurnIndexes)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function SuggestedList({ items }: { items: readonly SuggestedItem[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl bg-gray-50 p-3 text-sm text-gray-800">
          <p>{item.text}</p>
          {item.rationale && <p className="mt-1 text-gray-600">{item.rationale}</p>}
          {item.sourceTurnIndexes?.length ? (
            <p className="mt-1 text-xs font-medium text-gray-500">
              {sourceTurns(item.sourceTurnIndexes)}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function SafetyList({ items }: { items: readonly SafetyFlag[] }) {
  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4" aria-label="Segnalazioni da verificare">
      <h3 className="font-semibold text-amber-950">Segnalazioni da verificare</h3>
      <p className="mt-1 text-sm text-amber-900">
        Queste segnalazioni richiedono verifica umana e non sono diagnosi o decisioni automatiche.
      </p>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl bg-white/70 p-3 text-sm text-amber-950">
            <p>{item.description}</p>
            <p className="mt-1 text-xs font-medium text-amber-800">
              {sourceTurns(item.sourceTurnIndexes)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReportSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="text-base font-semibold text-gray-950">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function AiSessionReportContent({ report }: { report: AiSessionReport }) {
  const hasSummary = report.summary.text.trim().length > 0;
  return (
    <div className="mt-5 space-y-6 border-t border-gray-200 pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold tracking-tight text-gray-950">Report della sessione</h2>
        <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
          Bozza AI — da verificare
        </span>
      </div>

      <aside className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <span className="font-semibold">Verifica umana necessaria.</span>{' '}
        Questa bozza AI non sostituisce il giudizio professionale del coach.
      </aside>

      {report.safetyFlags.length > 0 ? <SafetyList items={report.safetyFlags} /> : null}

      {hasSummary ? (
        <ReportSection title="Sintesi">
          <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-800">
            <p>{report.summary.text}</p>
            <p className="mt-1 text-xs font-medium text-gray-500">
              {sourceTurns(report.summary.sourceTurnIndexes)}
            </p>
          </div>
        </ReportSection>
      ) : null}
      {report.themes.length > 0 ? <ReportSection title="Temi principali"><EvidenceList items={report.themes} /></ReportSection> : null}
      {report.athleteStatements.length > 0 ? <ReportSection title="Cosa ha espresso l’atleta"><EvidenceList items={report.athleteStatements} /></ReportSection> : null}
      {report.coachObservations.length > 0 ? <ReportSection title="Osservazioni per il coach"><EvidenceList items={report.coachObservations} /></ReportSection> : null}
      {report.goals.length > 0 ? <ReportSection title="Obiettivi"><EvidenceList items={report.goals} /></ReportSection> : null}
      {report.exercisesOrHomework.length > 0 ? <ReportSection title="Esercizi o attività concordate"><EvidenceList items={report.exercisesOrHomework} /></ReportSection> : null}
      {report.followUpQuestions.length > 0 ? <ReportSection title="Domande per la prossima sessione"><SuggestedList items={report.followUpQuestions} /></ReportSection> : null}
    </div>
  );
}

export function AiSessionReportPanel({ sessionId }: AiSessionReportPanelProps) {
  const [transcript, setTranscript] = useState<TranscriptTurn[] | null>(null);
  const [report, setReport] = useState<AiSessionReport | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationInFlight = useRef(false);
  const endpoint = `/api/coach/ai-session-notes/${sessionId}/report`;

  useEffect(() => {
    let active = true;
    void requestJson(endpoint, 'GET')
      .then((payload) => {
        if (!isRecord(payload) || !Array.isArray(payload.transcript)) {
          throw new Error('La trascrizione non è disponibile.');
        }
        if (active) setTranscript(payload.transcript as TranscriptTurn[]);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'La trascrizione non è disponibile.'
          );
        }
      })
      .finally(() => {
        if (active) setLoadingTranscript(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  async function generateReport() {
    if (generationInFlight.current || loadingTranscript || !transcript) return;
    generationInFlight.current = true;
    setIsGenerating(true);
    setError(null);
    try {
      const payload = await requestJson(endpoint, 'POST');
      if (!isRecord(payload) || !isRecord(payload.report)) {
        throw new Error('Il report AI non è disponibile. Riprova.');
      }
      setReport(payload.report as AiSessionReport);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Non è stato possibile generare il report AI. Riprova.'
      );
    } finally {
      generationInFlight.current = false;
      setIsGenerating(false);
    }
  }

  return (
    <section className="rounded-3xl border border-violet-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="ai-session-report-title">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-100">
          <Sparkles className="h-6 w-6 text-violet-700" />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-700">Appunti AI</p>
          <h2 id="ai-session-report-title" className="mt-1 text-2xl font-bold tracking-tight text-gray-950">Trascrizione e report della sessione</h2>
          <p className="mt-2 text-sm text-gray-600">Il report è una bozza per il coach e va sempre verificato prima dell’uso.</p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-gray-50 p-4">
        <h3 className="font-semibold text-gray-950">Trascrizione</h3>
        {loadingTranscript ? <p className="mt-2 text-sm text-gray-600">Caricamento trascrizione…</p> : null}
        {!loadingTranscript && transcript?.length ? (
          <ol className="mt-3 space-y-3">
            {transcript.map((turn) => (
              <li key={turn.turnIndex} className="border-l-2 border-violet-200 pl-3 text-sm text-gray-800">
                <p className="font-semibold text-gray-950">{turn.speakerLabel} <span className="font-normal text-gray-500">{formatTimestamp(turn.startMs)}</span></p>
                <p className="mt-1">{turn.text}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

      {!report && !loadingTranscript && transcript ? (
        <div className="mt-5">
          <Button type="button" className="rounded-full" onClick={generateReport} disabled={isGenerating || transcript.length === 0}>
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isGenerating ? 'Sto analizzando la sessione…' : 'Genera report AI'}
          </Button>
        </div>
      ) : null}

      {report ? <AiSessionReportContent report={report} /> : null}
    </section>
  );
}
