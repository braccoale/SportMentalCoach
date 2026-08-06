'use client';

import {
  CheckCircle2,
  Compass,
  FileText,
  History,
  Lightbulb,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import type { MentalJourney } from '@/lib/core/ai-session-notes/mental-journey';
import {
  CoachNotesPanel,
  KeyMomentsPanel,
  SessionCompassContent,
  SessionOverview,
  TrackedCommitmentsSection,
  evidenceLabel,
} from './session-compass/report-sections';
import {
  AthleteJourneyPanel,
  TranscriptHistoryNav,
  selectPreviousJourneyEntry,
} from './session-compass/journey-panel';
import { TranscriptPanel } from './session-compass/transcript-panel';
import { TranscriptHistorySearch } from './session-compass/transcript-history-search';
import {
  segmentAnchorId,
  type CompassTabId,
  type CompassTranscriptSegment,
  type SessionCompassView,
  type TrackedCommitmentChange,
  type TrackedCommitmentView,
  type TrackedCommitmentStatus,
} from './session-compass/types';

export {
  SessionCompassContent,
  TrackedCommitmentsSection,
  evidenceLabel,
  segmentAnchorId,
};
export type {
  CompassTranscriptSegment,
  SessionCompassView,
  TrackedCommitmentChange,
  TrackedCommitmentStatus,
  TrackedCommitmentView,
};

const TABS: Array<{
  id: CompassTabId;
  label: string;
  icon: (props: { className?: string }) => ReactNode;
}> = [
  { id: 'overview', label: 'Panoramica', icon: (props) => <Sparkles {...props} /> },
  { id: 'journey', label: 'Percorso atleta', icon: (props) => <History {...props} /> },
  { id: 'transcript', label: 'Trascrizione', icon: (props) => <FileText {...props} /> },
  { id: 'moments', label: 'Momenti chiave', icon: (props) => <Lightbulb {...props} /> },
  { id: 'notes', label: 'Appunti coach', icon: (props) => <MessageSquareText {...props} /> },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function apiErrorMessage(value: unknown): string {
  return isRecord(value) && typeof value.error === 'string'
    ? value.error
    : 'Non è stato possibile completare la richiesta. Riprova.';
}

async function requestJson(
  url: string,
  method: 'GET' | 'POST' | 'PATCH',
  body?: unknown
): Promise<unknown> {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(payload));
  return payload;
}

const REPORT_UPDATED_EVENT = 'kaipai:session-compass-report-updated';
const OPEN_EVIDENCE_EVENT = 'kaipai:session-compass-open-evidence';

type CompassReportEventDetail = {
  sessionId: number;
  report: SessionCompassView | null;
};

function readCompassReport(payload: unknown): SessionCompassView | null {
  return isRecord(payload)
    ? (payload.report ?? null) as SessionCompassView | null
    : null;
}

export function SessionCompassStatusBanner({ report }: { report: SessionCompassView | null }) {
  if (!report) {
    return (
      <StatusMessage tone="neutral">
        Il riepilogo sessione non è ancora stato generato per questa sessione.
      </StatusMessage>
    );
  }
  if (report.status === 'generating') {
    return <StatusMessage tone="violet">Elaborazione in corso…</StatusMessage>;
  }
  if (report.status === 'failed') {
    return (
      <StatusMessage tone="danger" alert>
        L’elaborazione non è riuscita. Puoi riprovare a generare la bozza.
      </StatusMessage>
    );
  }
  if (report.isApproved) {
    return (
      <StatusMessage tone={report.isStale ? 'warning' : 'success'}>
        Report approvato (versione {report.reportVersion}). È immutabile: una rigenerazione crea
        una nuova bozza.
        {report.isStale
          ? ' La trascrizione o le istruzioni AI sono cambiate: rigenera per ottenere una bozza aggiornata.'
          : ''}
      </StatusMessage>
    );
  }
  return null;
}

function StatusMessage({
  tone,
  alert = false,
  children,
}: {
  tone: 'neutral' | 'violet' | 'success' | 'warning' | 'danger';
  alert?: boolean;
  children: ReactNode;
}) {
  const tones = {
    neutral: 'border-gray-200 bg-gray-50 text-gray-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-950',
    danger: 'border-red-200 bg-red-50 text-red-800',
  };
  return (
    <p
      role={alert ? 'alert' : 'status'}
      className={`rounded-xl border px-4 py-3 text-sm leading-6 ${tones[tone]}`}
    >
      {children}
    </p>
  );
}

function CompassSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Caricamento riepilogo sessione">
      <div className="h-12 animate-pulse rounded-xl bg-gray-100" />
      <div className="h-48 animate-pulse rounded-2xl bg-gray-100" />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
      </div>
      <span className="sr-only">Caricamento riepilogo sessione…</span>
    </div>
  );
}

export function SessionCompassPanel({
  sessionId,
  sessionDate,
  athleteName,
  initialJourney,
}: {
  sessionId: number;
  sessionDate: string | null;
  athleteName: string;
  initialJourney: MentalJourney | null;
}) {
  const endpoint = `/api/coach/ai-session-notes/${sessionId}/compass`;
  const [report, setReport] = useState<SessionCompassView | null>(null);
  const [transcriptBySession, setTranscriptBySession] = useState<Record<number, CompassTranscriptSegment[]>>({});
  const [transcriptLoadedBySession, setTranscriptLoadedBySession] = useState<Record<number, boolean>>({});
  const [transcriptErrorBySession, setTranscriptErrorBySession] = useState<Record<number, string | null>>({});
  const [transcriptSessionId, setTranscriptSessionId] = useState(sessionId);
  const [activeTab, setActiveTab] = useState<CompassTabId>('overview');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [coachNote, setCoachNote] = useState('');
  const [transcriptLoadingId, setTranscriptLoadingId] = useState<number | null>(null);
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<number | null>(null);
  const inFlight = useRef(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const applyReport = useCallback((payload: unknown) => {
    const next = readCompassReport(payload);
    setReport(next);
    setCoachNote(next?.document?.coachNote ?? '');
    window.dispatchEvent(
      new CustomEvent<CompassReportEventDetail>(REPORT_UPDATED_EVENT, {
        detail: { sessionId, report: next },
      })
    );
  }, [sessionId]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applyReport(await requestJson(endpoint, 'GET'));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Il riepilogo sessione non è disponibile.'
      );
    } finally {
      setLoading(false);
    }
  }, [applyReport, endpoint]);

  const loadTranscript = useCallback(async (targetSessionId: number) => {
    if (transcriptLoadingId === targetSessionId || transcriptLoadedBySession[targetSessionId]) return;
    setTranscriptLoadingId(targetSessionId);
    setTranscriptErrorBySession((current) => ({ ...current, [targetSessionId]: null }));
    try {
      const payload = await requestJson(`/api/coach/ai-session-notes/${targetSessionId}/compass/transcript`, 'GET');
      if (isRecord(payload) && Array.isArray(payload.transcript)) {
        setTranscriptBySession((current) => ({
          ...current,
          [targetSessionId]: payload.transcript as CompassTranscriptSegment[],
        }));
      } else {
        setTranscriptBySession((current) => ({ ...current, [targetSessionId]: [] }));
      }
      setTranscriptLoadedBySession((current) => ({ ...current, [targetSessionId]: true }));
    } catch (requestError) {
      setTranscriptErrorBySession((current) => ({
        ...current,
        [targetSessionId]: requestError instanceof Error
          ? requestError.message
          : 'La trascrizione non è disponibile.',
      }));
    } finally {
      setTranscriptLoadingId((current) => current === targetSessionId ? null : current);
    }
  }, [transcriptLoadedBySession, transcriptLoadingId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    if (
      activeTab === 'transcript' &&
      !transcriptLoadedBySession[transcriptSessionId] &&
      transcriptLoadingId !== transcriptSessionId
    ) {
      void loadTranscript(transcriptSessionId);
    }
  }, [activeTab, loadTranscript, transcriptLoadedBySession, transcriptLoadingId, transcriptSessionId]);

  useEffect(() => {
    if (
      activeTab !== 'transcript' ||
      highlightedSegmentId === null ||
      !transcriptLoadedBySession[transcriptSessionId]
    ) return;
    const timer = window.setTimeout(() => {
      const element = document.getElementById(segmentAnchorId(highlightedSegmentId));
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element?.focus({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [activeTab, highlightedSegmentId, transcriptBySession, transcriptLoadedBySession, transcriptSessionId]);

  async function run(action: () => Promise<unknown>, onDone?: (payload: unknown) => void) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = await action();
      applyReport(payload);
      onDone?.(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Operazione non riuscita.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function openEvidence(segmentId: number, targetSessionId = sessionId) {
    setTranscriptSessionId(targetSessionId);
    setHighlightedSegmentId(segmentId);
    setActiveTab('transcript');
  }

  useEffect(() => {
    const onOpenEvidence = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as { sessionId?: unknown; segmentId?: unknown } | null;
      if (
        detail?.sessionId !== sessionId ||
        !Number.isInteger(detail.segmentId)
      ) {
        return;
      }
      openEvidence(Number(detail.segmentId));
    };
    window.addEventListener(OPEN_EVIDENCE_EVENT, onOpenEvidence);
    return () => window.removeEventListener(OPEN_EVIDENCE_EVENT, onOpenEvidence);
  }, [sessionId]);

  function openTranscript(targetSessionId: number, segmentId?: number) {
    setTranscriptSessionId(targetSessionId);
    setHighlightedSegmentId(segmentId ?? null);
    setActiveTab('transcript');
  }

  function selectTab(tab: CompassTabId) {
    setActiveTab(tab);
    if (tab !== 'transcript') setHighlightedSegmentId(null);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <section
      id="session-compass"
      aria-labelledby="session-compass-title"
      className="min-w-0 w-full max-w-full overflow-hidden"
    >
      <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100">
              <Compass className="h-5 w-5 text-violet-700" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">
                  Appunti AI
                </p>
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600">
                  <LockKeyhole className="h-3 w-3" /> Solo coach
                </span>
              </div>
              <h2 id="session-compass-title" className="mt-1 text-2xl font-bold tracking-tight text-gray-950">
                Riepilogo sessione
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">
                Report riservato al coach. Non è visibile all’atleta e non sostituisce il tuo
                giudizio professionale.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || loading}
              onClick={() =>
                run(
                  () => requestJson(`${endpoint}/regenerate`, 'POST'),
                  (payload) => {
                    if (isRecord(payload) && payload.regenerated === false) {
                      setNotice('La bozza è già allineata alla trascrizione corrente.');
                    } else {
                      setNotice('Nuova bozza generata. Verificala prima di approvarla.');
                    }
                  }
                )
              }
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {report ? 'Rigenera bozza' : 'Genera riepilogo sessione'}
            </Button>
            {report && !report.isApproved && report.document ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() => requestJson(`${endpoint}/approve`, 'POST'), () =>
                    setNotice('Report approvato e impegni sincronizzati.')
                  )
                }
              >
                <CheckCircle2 className="h-4 w-4" /> Approva report
              </Button>
            ) : null}
          </div>
        </div>

        {report?.document ? (
          <div className="min-w-0 max-w-full overflow-hidden border-t border-gray-200 px-3 sm:px-5">
            <div
              role="tablist"
              aria-label="Sezioni riepilogo sessione"
              className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:flex lg:min-w-max"
            >
              {TABS.map((tab, index) => {
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    ref={(element) => {
                      tabRefs.current[index] = element;
                    }}
                    id={`compass-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`compass-panel-${tab.id}`}
                    tabIndex={selected ? 0 : -1}
                    className={`relative inline-flex min-h-12 min-w-0 items-center justify-start gap-2 px-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 ${
                      selected ? 'text-violet-700' : 'text-gray-600 hover:text-gray-950'
                    }`}
                    onClick={() => selectTab(tab.id)}
                    onKeyDown={(event) => handleTabKeyDown(event, index)}
                  >
                    {tab.icon({ className: 'h-4 w-4' })}
                    {tab.label}
                    {selected ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-violet-600" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        {loading ? (
          <CompassSkeleton />
        ) : !error ? (
          <SessionCompassStatusBanner report={report} />
        ) : null}

        {error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>{error}</p>
            <Button type="button" variant="outline" className="mt-3 bg-white" onClick={() => void loadReport()}>
              Riprova
            </Button>
          </div>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700">
            {notice}
          </p>
        ) : null}

        {!loading && !error && !report?.document ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <Compass className="mx-auto h-7 w-7 text-violet-500" />
            <h3 className="mt-3 font-bold text-gray-950">Il report non è ancora disponibile</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-gray-600">
              Quando la trascrizione è pronta puoi generare una bozza del riepilogo sessione da verificare e approvare.
            </p>
          </div>
        ) : null}

        {report?.document ? (
          <div
            id={`compass-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`compass-tab-${activeTab}`}
            tabIndex={0}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            {activeTab === 'overview' ? (
              <SessionOverview
                report={report.document}
                isApproved={report.isApproved}
                previousJourneyEntry={selectPreviousJourneyEntry(
                  initialJourney?.timeline ?? [],
                  sessionId,
                  sessionDate
                )}
                onOpenEvidence={openEvidence}
                onOpenMoments={() => selectTab('moments')}
                onOpenNotes={() => selectTab('notes')}
              />
            ) : null}
            {activeTab === 'journey' ? (
              <AthleteJourneyPanel
                journey={initialJourney}
                report={report.document}
                currentSessionId={sessionId}
                currentSessionDate={sessionDate}
                athleteName={athleteName}
                trackedCommitments={report.trackedCommitments}
                onOpenTranscript={openTranscript}
              />
            ) : null}
            {activeTab === 'transcript' ? (
              <div className="space-y-5">
                {initialJourney ? (
                  <TranscriptHistorySearch
                    athleteUserId={initialJourney.athleteUserId}
                    onOpenTranscript={openTranscript}
                  />
                ) : null}
                <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
                  <TranscriptHistoryNav
                    journey={initialJourney}
                    currentSessionId={sessionId}
                    currentSessionDate={sessionDate}
                    selectedSessionId={transcriptSessionId}
                    onSelect={(targetSessionId) => openTranscript(targetSessionId)}
                  />
                  <TranscriptPanel
                    transcript={transcriptBySession[transcriptSessionId] ?? []}
                    loading={transcriptLoadingId === transcriptSessionId}
                    error={transcriptErrorBySession[transcriptSessionId] ?? null}
                    highlightedSegmentId={highlightedSegmentId}
                    onRetry={() => void loadTranscript(transcriptSessionId)}
                    eyebrow={transcriptSessionId === sessionId ? 'Sessione corrente' : 'Sessione passata'}
                    title={transcriptSessionId === sessionId ? 'Trascrizione' : 'Trascrizione selezionata'}
                    description={
                      transcriptSessionId === sessionId
                        ? 'Cerca nella conversazione oppure filtra per speaker. I momenti chiave aprono il segmento corrispondente.'
                        : 'La sessione corrente resta disponibile nel pannello laterale. Questa trascrizione è caricata solo su richiesta.'
                    }
                  />
                </div>
              </div>
            ) : null}
            {activeTab === 'moments' ? (
              <KeyMomentsPanel
                report={report.document}
                journey={initialJourney}
                currentSessionId={sessionId}
                onOpenEvidence={openEvidence}
                onOpenTranscript={openTranscript}
              />
            ) : null}
            {activeTab === 'notes' ? (
              <CoachNotesPanel
                report={report.document}
                editable={report.canEditCoachNote}
                reportEditable={!report.isApproved}
                trackedCommitments={report.trackedCommitments}
                coachNote={coachNote}
                busy={busy}
                onCoachNoteChange={setCoachNote}
                onSaveCoachNote={() =>
                  run(() => requestJson(endpoint, 'PATCH', { coachNote }), () =>
                    setNotice('Nota privata salvata.')
                  )
                }
                onCommitmentChange={(commitmentId, change) =>
                  run(() => requestJson(endpoint, 'PATCH', { commitment: { id: commitmentId, ...change } }))
                }
                onTrackedCommitmentChange={(commitmentId, change) =>
                  run(() => requestJson(`${endpoint}/commitments`, 'PATCH', { commitmentId, ...change }))
                }
                onOpenEvidence={openEvidence}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
