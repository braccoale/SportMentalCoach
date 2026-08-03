'use client';

import { CheckCircle2, Compass, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type {
  Commitment,
  CommitmentStatus,
  CompassEvidence,
  CompassSpeaker,
  SessionCompassReport,
} from '@/lib/core/ai-session-notes/session-compass-contract';

export type TrackedCommitmentStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

/** Impegno operativo, così come arriva serializzato dall'API coach. */
export type TrackedCommitmentView = {
  id: number;
  title: string;
  owner: CompassSpeaker;
  status: TrackedCommitmentStatus;
  dueDate: string | null;
  completedAt: string | null;
  athleteNote: string | null;
  sourceTimestampMs: number;
  sourceTranscriptSegmentId: number | null;
  sourceExcerpt: string;
  manuallyEdited: boolean;
};

export type SessionCompassView = {
  reportId: number;
  sessionId: number;
  reportVersion: number;
  status: 'generating' | 'ready_for_review' | 'approved' | 'failed';
  sourceFingerprint: string | null;
  isApproved: boolean;
  isStale: boolean;
  approvedAt: string | null;
  errorCode: string | null;
  updatedAt: string;
  document: SessionCompassReport | null;
  canEditCoachNote: boolean;
  trackedCommitments: TrackedCommitmentView[];
};

export type CompassTranscriptSegment = {
  transcriptSegmentId: number;
  startMs: number;
  minute: number;
  speaker: CompassSpeaker;
  text: string;
};

const SPEAKER_LABEL: Record<CompassSpeaker, string> = {
  coach: 'Coach',
  athlete: 'Atleta',
};

const COMMITMENT_STATUS_LABEL: Record<CommitmentStatus, string> = {
  pending: 'Da fare',
  in_progress: 'In corso',
  done: 'Completato',
  dropped: 'Annullato',
};

const COMMITMENT_STATUS_ORDER: CommitmentStatus[] = [
  'pending',
  'in_progress',
  'done',
  'dropped',
];

export function segmentAnchorId(transcriptSegmentId: number): string {
  return `compass-segment-${transcriptSegmentId}`;
}

export function evidenceLabel(evidence: CompassEvidence): string {
  return `${SPEAKER_LABEL[evidence.speaker]} · min ${evidence.minute}`;
}

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
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(payload));
  return payload;
}

function CompassSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold text-gray-950">{title}</h3>
      {description ? <p className="text-sm text-gray-600">{description}</p> : null}
      {children}
    </section>
  );
}

function EvidenceButton({
  evidence,
  onOpenEvidence,
}: {
  evidence: CompassEvidence;
  onOpenEvidence?: (segmentId: number) => void;
}) {
  return (
    <button
      type="button"
      className="mt-2 block w-full rounded-lg border border-gray-200 bg-white p-2 text-left text-xs text-gray-600 hover:border-violet-300 hover:bg-violet-50"
      onClick={() => onOpenEvidence?.(evidence.transcriptSegmentId)}
    >
      <span className="font-semibold text-gray-800">{evidenceLabel(evidence)}</span>
      <span className="mt-1 block italic">«{evidence.quote}»</span>
    </button>
  );
}

function CommitmentRow({
  commitment,
  editable,
  onChange,
  onOpenEvidence,
}: {
  commitment: Commitment;
  editable: boolean;
  onChange: (change: { text?: string; owner?: CompassSpeaker; status?: CommitmentStatus }) => void;
  onOpenEvidence?: (segmentId: number) => void;
}) {
  const [text, setText] = useState(commitment.text);

  useEffect(() => {
    setText(commitment.text);
  }, [commitment.text]);

  return (
    <li className="rounded-xl bg-gray-50 p-3 text-sm text-gray-800">
      {editable ? (
        <label className="block">
          <span className="sr-only">Testo dell’impegno</span>
          <textarea
            className="w-full rounded-lg border border-gray-200 p-2 text-sm"
            rows={2}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => text.trim() && text !== commitment.text && onChange({ text })}
          />
        </label>
      ) : (
        <p>{commitment.text}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          <span className="text-gray-600">Responsabile</span>
          <select
            className="rounded-lg border border-gray-200 px-2 py-1"
            value={commitment.owner}
            disabled={!editable}
            onChange={(event) => onChange({ owner: event.target.value as CompassSpeaker })}
          >
            <option value="coach">Coach</option>
            <option value="athlete">Atleta</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-gray-600">Stato</span>
          <select
            className="rounded-lg border border-gray-200 px-2 py-1"
            value={commitment.status}
            disabled={!editable}
            onChange={(event) => onChange({ status: event.target.value as CommitmentStatus })}
          >
            {COMMITMENT_STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {COMMITMENT_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        {commitment.dueDate ? (
          <span className="rounded-full bg-white px-2 py-1 text-gray-700">
            Scadenza {commitment.dueDate}
          </span>
        ) : null}
      </div>
      <EvidenceButton evidence={commitment.evidence} onOpenEvidence={onOpenEvidence} />
    </li>
  );
}

/** Contenuto puro del report: reso anche lato server nei test di rendering. */
export function SessionCompassContent({
  report,
  editable = false,
  hideCommitments = false,
  onOpenEvidence,
  onCommitmentChange,
}: {
  report: SessionCompassReport;
  editable?: boolean;
  /** Dopo l'approvazione gli impegni vivono nell'entità dedicata, non nel JSON. */
  hideCommitments?: boolean;
  onOpenEvidence?: (segmentId: number) => void;
  onCommitmentChange?: (
    commitmentId: string,
    change: { text?: string; owner?: CompassSpeaker; status?: CommitmentStatus }
  ) => void;
}) {
  const overview = report.sessionOverview;
  return (
    <div className="space-y-6">
      <CompassSection title="Sintesi della sessione">
        <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-800">{overview.summary}</p>
        {overview.summaryEvidence.map((evidence) => (
          <EvidenceButton
            key={`summary-${evidence.transcriptSegmentId}-${evidence.startMs}`}
            evidence={evidence}
            onOpenEvidence={onOpenEvidence}
          />
        ))}
      </CompassSection>

      {overview.themes.length ? (
        <CompassSection title="Temi emersi">
          <ul className="space-y-3">
            {overview.themes.map((theme) => (
              <li key={theme.id} className="rounded-xl bg-gray-50 p-3 text-sm text-gray-800">
                <p>{theme.text}</p>
                <EvidenceButton evidence={theme.evidence} onOpenEvidence={onOpenEvidence} />
              </li>
            ))}
          </ul>
        </CompassSection>
      ) : null}

      {overview.emergingResource ? (
        <CompassSection title="Risorsa emersa">
          <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">
            <p>{overview.emergingResource.text}</p>
            <EvidenceButton
              evidence={overview.emergingResource.evidence}
              onOpenEvidence={onOpenEvidence}
            />
          </div>
        </CompassSection>
      ) : null}

      {report.keyMoments.length ? (
        <CompassSection title="Momenti chiave">
          <ul className="space-y-3">
            {report.keyMoments.map((moment) => (
              <li key={moment.id} className="rounded-xl bg-gray-50 p-3 text-sm text-gray-800">
                <p className="font-semibold text-gray-950">{moment.title}</p>
                <p className="mt-1">{moment.explanation}</p>
                <EvidenceButton evidence={moment.evidence} onOpenEvidence={onOpenEvidence} />
              </li>
            ))}
          </ul>
        </CompassSection>
      ) : null}

      {report.commitments.length && !hideCommitments ? (
        <CompassSection title="Impegni concordati">
          <ul className="space-y-3">
            {report.commitments.map((commitment) => (
              <CommitmentRow
                key={commitment.id}
                commitment={commitment}
                editable={editable}
                onChange={(change) => onCommitmentChange?.(commitment.id, change)}
                onOpenEvidence={onOpenEvidence}
              />
            ))}
          </ul>
        </CompassSection>
      ) : null}

      {report.nextSessionPrep.length ? (
        <CompassSection
          title="Preparazione prossima sessione"
          description="Spunti da verificare o esplorare, non indicazioni cliniche."
        >
          <ul className="space-y-3">
            {report.nextSessionPrep.map((item) => (
              <li key={item.id} className="rounded-xl bg-gray-50 p-3 text-sm text-gray-800">
                <p>{item.text}</p>
                <EvidenceButton evidence={item.evidence} onOpenEvidence={onOpenEvidence} />
              </li>
            ))}
          </ul>
        </CompassSection>
      ) : null}
    </div>
  );
}

const TRACKED_STATUS_LABEL: Record<TrackedCommitmentStatus, string> = {
  pending: 'Da fare',
  in_progress: 'In corso',
  completed: 'Completato',
  skipped: 'Non riuscito',
};

const TRACKED_STATUS_ORDER: TrackedCommitmentStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'skipped',
];

export type TrackedCommitmentChange = {
  title?: string;
  owner?: CompassSpeaker;
  status?: TrackedCommitmentStatus;
  dueDate?: string | null;
};

/**
 * Gli impegni operativi dopo l'approvazione: qui il coach vede lo stato reale,
 * incluso l'esito dichiarato dall'atleta, e può correggerlo.
 */
export function TrackedCommitmentsSection({
  commitments,
  onChange,
  onOpenEvidence,
}: {
  commitments: readonly TrackedCommitmentView[];
  onChange?: (commitmentId: number, change: TrackedCommitmentChange) => void;
  onOpenEvidence?: (segmentId: number) => void;
}) {
  if (!commitments.length) return null;
  return (
    <CompassSection
      title="Impegni attivi"
      description="Sincronizzati all’approvazione. Le tue modifiche prevalgono sulla bozza AI."
    >
      <ul className="space-y-3">
        {commitments.map((commitment) => (
          <li key={commitment.id} className="rounded-xl border border-gray-200 p-3 text-sm text-gray-800">
            <label className="block">
              <span className="sr-only">Testo dell’impegno</span>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-200 p-2 text-sm"
                defaultValue={commitment.title}
                onBlur={(event) =>
                  event.target.value.trim() && event.target.value !== commitment.title
                    ? onChange?.(commitment.id, { title: event.target.value })
                    : undefined
                }
              />
            </label>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1">
                <span className="text-gray-600">Responsabile</span>
                <select
                  className="rounded-lg border border-gray-200 px-2 py-1"
                  value={commitment.owner}
                  onChange={(event) =>
                    onChange?.(commitment.id, { owner: event.target.value as CompassSpeaker })
                  }
                >
                  <option value="coach">Coach</option>
                  <option value="athlete">Atleta</option>
                </select>
              </label>
              <label className="flex items-center gap-1">
                <span className="text-gray-600">Stato</span>
                <select
                  className="rounded-lg border border-gray-200 px-2 py-1"
                  value={commitment.status}
                  onChange={(event) =>
                    onChange?.(commitment.id, {
                      status: event.target.value as TrackedCommitmentStatus,
                    })
                  }
                >
                  {TRACKED_STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {TRACKED_STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1">
                <span className="text-gray-600">Scadenza</span>
                <input
                  type="date"
                  className="rounded-lg border border-gray-200 px-2 py-1"
                  defaultValue={commitment.dueDate ?? ''}
                  onChange={(event) =>
                    onChange?.(commitment.id, { dueDate: event.target.value || null })
                  }
                />
              </label>
              {commitment.manuallyEdited ? (
                <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                  Modificato manualmente
                </span>
              ) : null}
            </div>

            {commitment.status === 'completed' ? (
              <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                L’atleta ha completato questo impegno
              </p>
            ) : null}
            {commitment.status === 'skipped' ? (
              <div className="mt-2">
                <p className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                  L’atleta non è riuscito a completarlo
                </p>
                {commitment.athleteNote ? (
                  <p className="mt-1 text-sm text-gray-700">«{commitment.athleteNote}»</p>
                ) : null}
              </div>
            ) : null}

            <button
              type="button"
              className="mt-2 block w-full rounded-lg border border-gray-200 bg-white p-2 text-left text-xs text-gray-600 hover:border-violet-300 hover:bg-violet-50"
              onClick={() =>
                commitment.sourceTranscriptSegmentId !== null
                  ? onOpenEvidence?.(commitment.sourceTranscriptSegmentId)
                  : undefined
              }
            >
              <span className="font-semibold text-gray-800">
                min {Math.floor(commitment.sourceTimestampMs / 60_000)}
              </span>
              <span className="mt-1 block italic">«{commitment.sourceExcerpt}»</span>
            </button>
          </li>
        ))}
      </ul>
    </CompassSection>
  );
}

export function SessionCompassStatusBanner({ report }: { report: SessionCompassView | null }) {
  if (!report) {
    return (
      <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
        Session Compass non è ancora stato generato per questa sessione.
      </p>
    );
  }
  if (report.status === 'generating') {
    return (
      <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-900">
        Elaborazione in corso…
      </p>
    );
  }
  if (report.status === 'failed') {
    return (
      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        L’elaborazione non è riuscita. Puoi riprovare a generare la bozza.
      </p>
    );
  }
  if (report.isApproved) {
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        Report approvato (versione {report.reportVersion}). È immutabile: una rigenerazione crea una nuova bozza.
      </p>
    );
  }
  return (
    <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-900">
      Bozza pronta da verificare (versione {report.reportVersion}).
      {report.isStale ? ' La trascrizione è cambiata: puoi rigenerare la bozza.' : ''}
    </p>
  );
}

export function SessionCompassPanel({ sessionId }: { sessionId: number }) {
  const endpoint = `/api/coach/ai-session-notes/${sessionId}/compass`;
  const [report, setReport] = useState<SessionCompassView | null>(null);
  const [transcript, setTranscript] = useState<CompassTranscriptSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [coachNote, setCoachNote] = useState('');
  const inFlight = useRef(false);

  const applyReport = useCallback((payload: unknown) => {
    if (!isRecord(payload)) return;
    const next = (payload.report ?? null) as SessionCompassView | null;
    setReport(next);
    setCoachNote(next?.document?.coachNote ?? '');
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      requestJson(endpoint, 'GET'),
      requestJson(`${endpoint}/transcript`, 'GET').catch(() => null),
    ])
      .then(([reportPayload, transcriptPayload]) => {
        if (!active) return;
        applyReport(reportPayload);
        if (isRecord(transcriptPayload) && Array.isArray(transcriptPayload.transcript)) {
          setTranscript(transcriptPayload.transcript as CompassTranscriptSegment[]);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : 'Session Compass non è disponibile.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint, applyReport]);

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

  function openEvidence(segmentId: number) {
    document.getElementById(segmentAnchorId(segmentId))?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }

  return (
    <section
      className="rounded-3xl border border-violet-200 bg-white p-6 shadow-sm sm:p-8"
      aria-labelledby="session-compass-title"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-100">
          <Compass className="h-6 w-6 text-violet-700" />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-700">Appunti AI</p>
          <h2 id="session-compass-title" className="mt-1 text-2xl font-bold tracking-tight text-gray-950">
            Session Compass
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Report riservato al coach. Non è visibile all’atleta e non sostituisce il tuo giudizio professionale.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {loading ? (
          <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">Caricamento Session Compass…</p>
        ) : (
          <SessionCompassStatusBanner report={report} />
        )}

        {error ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
            {notice}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={busy || loading}
            onClick={() =>
              run(
                () => requestJson(`${endpoint}/regenerate`, 'POST'),
                (payload) => {
                  if (isRecord(payload) && payload.regenerated === false) {
                    setNotice('La bozza è già allineata alla trascrizione corrente.');
                  }
                }
              )
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {report ? 'Rigenera bozza' : 'Genera Session Compass'}
          </Button>
          {report && !report.isApproved && report.document ? (
            <Button
              type="button"
              className="rounded-full"
              disabled={busy}
              onClick={() => run(() => requestJson(`${endpoint}/approve`, 'POST'))}
            >
              <CheckCircle2 className="h-4 w-4" />
              Approva report
            </Button>
          ) : null}
        </div>

        {report?.document ? (
          <div className="space-y-6 border-t border-gray-200 pt-5">
            <SessionCompassContent
              report={report.document}
              editable={!report.isApproved}
              hideCommitments={report.trackedCommitments.length > 0}
              onOpenEvidence={openEvidence}
              onCommitmentChange={(commitmentId, change) =>
                run(() =>
                  requestJson(endpoint, 'PATCH', { commitment: { id: commitmentId, ...change } })
                )
              }
            />

            <TrackedCommitmentsSection
              commitments={report.trackedCommitments}
              onOpenEvidence={openEvidence}
              onChange={(commitmentId, change) =>
                run(() =>
                  requestJson(`${endpoint}/commitments`, 'PATCH', { commitmentId, ...change })
                )
              }
            />

            <CompassSection
              title="Nota del coach"
              description="Campo libero e privato. Una rigenerazione non lo sovrascrive."
            >
              <textarea
                className="w-full rounded-xl border border-gray-200 p-3 text-sm"
                rows={4}
                aria-label="Nota del coach"
                value={coachNote}
                disabled={!report.canEditCoachNote}
                onChange={(event) => setCoachNote(event.target.value)}
              />
              {report.canEditCoachNote ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 rounded-full"
                  disabled={busy}
                  onClick={() => run(() => requestJson(endpoint, 'PATCH', { coachNote }))}
                >
                  Salva nota
                </Button>
              ) : null}
            </CompassSection>
          </div>
        ) : null}

        {transcript.length ? (
          <details className="rounded-2xl bg-gray-50 p-4">
            <summary className="cursor-pointer font-semibold text-gray-950">Trascrizione</summary>
            <ol className="mt-3 space-y-3">
              {transcript.map((segment) => (
                <li
                  key={segment.transcriptSegmentId}
                  id={segmentAnchorId(segment.transcriptSegmentId)}
                  className="border-l-2 border-violet-200 pl-3 text-sm text-gray-800"
                >
                  <p className="font-semibold text-gray-950">
                    {SPEAKER_LABEL[segment.speaker]}{' '}
                    <span className="font-normal text-gray-500">min {segment.minute}</span>
                  </p>
                  <p className="mt-1">{segment.text}</p>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </section>
  );
}
