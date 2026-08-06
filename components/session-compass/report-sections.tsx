'use client';

import {
  ArrowRight,
  Check,
  Circle,
  Clock3,
  Compass,
  Lightbulb,
  ListChecks,
  MessageSquareQuote,
  Sparkles,
  Target,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { MentalJourney, MentalJourneyEntry } from '@/lib/core/ai-session-notes/mental-journey';
import type {
  Commitment,
  CommitmentStatus,
  CompassEvidence,
  CompassSpeaker,
  KeyMomentCategory,
  SessionCompassReport,
} from '@/lib/core/ai-session-notes/session-compass-contract';
import { SessionContinuityCard } from './journey-panel';
import { EmotionalTrendChart } from './charts';
import { formatTranscriptTimestamp } from './time';
import {
  SPEAKER_LABEL,
  type TrackedCommitmentChange,
  type TrackedCommitmentStatus,
  type TrackedCommitmentView,
} from './types';

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

export function evidenceLabel(evidence: CompassEvidence): string {
  const source = evidence.speaker === 'athlete' ? 'Dichiarazione atleta' : 'Passaggio del coach';
  return `${source} · ${formatTranscriptTimestamp(evidence.startMs)}`;
}

function Surface({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      {eyebrow ? (
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">
          {eyebrow}
        </p>
      ) : null}
      <h3 className={`${eyebrow ? 'mt-1' : ''} text-base font-bold text-gray-950`}>{title}</h3>
      {description ? <p className="mt-1 text-sm leading-6 text-gray-600">{description}</p> : null}
    </div>
  );
}

export function EvidenceButton({
  evidence,
  onOpenEvidence,
}: {
  evidence: CompassEvidence;
  onOpenEvidence?: (segmentId: number) => void;
}) {
  return (
    <button
      type="button"
      className="group mt-3 flex w-full items-start gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-xs text-gray-600 transition hover:border-violet-300 hover:bg-violet-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      onClick={() => onOpenEvidence?.(evidence.transcriptSegmentId)}
      aria-label={`${evidenceLabel(evidence)}: vai al punto della trascrizione`}
    >
      <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-gray-800">{evidenceLabel(evidence)}</span>
        <span className="mt-1 block line-clamp-2 italic">«{evidence.quote}»</span>
      </span>
      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-violet-600" />
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
  onChange: (change: {
    text?: string;
    owner?: CompassSpeaker;
    status?: CommitmentStatus;
  }) => void;
  onOpenEvidence?: (segmentId: number) => void;
}) {
  const [text, setText] = useState(commitment.text);

  useEffect(() => setText(commitment.text), [commitment.text]);

  return (
    <li className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 text-sm text-gray-800">
      <div className="flex items-start gap-3">
        <Circle className="mt-1 h-4 w-4 shrink-0 text-violet-500" />
        <div className="min-w-0 flex-1">
          {editable ? (
            <label className="block">
              <span className="sr-only">Testo dell’impegno</span>
              <textarea
                className="min-h-20 w-full resize-y rounded-lg border border-gray-200 bg-white p-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                value={text}
                onChange={(event) => setText(event.target.value)}
                onBlur={() => text.trim() && text !== commitment.text && onChange({ text })}
              />
            </label>
          ) : (
            <p className="leading-6">{commitment.text}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5">
              <span className="text-gray-500">Responsabile</span>
              <select
                className="min-h-9 rounded-lg border border-gray-200 bg-white px-2"
                value={commitment.owner}
                disabled={!editable}
                onChange={(event) => onChange({ owner: event.target.value as CompassSpeaker })}
              >
                <option value="coach">Coach</option>
                <option value="athlete">Atleta</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-gray-500">Stato</span>
              <select
                className="min-h-9 rounded-lg border border-gray-200 bg-white px-2"
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
              <span className="inline-flex min-h-9 items-center rounded-lg border border-gray-200 bg-white px-2.5 text-gray-600">
                Scadenza {commitment.dueDate}
              </span>
            ) : null}
          </div>
          <EvidenceButton evidence={commitment.evidence} onOpenEvidence={onOpenEvidence} />
        </div>
      </div>
    </li>
  );
}

export function SessionOverview({
  report,
  isApproved,
  previousJourneyEntry,
  onOpenEvidence,
  onOpenMoments,
  onOpenNotes,
}: {
  report: SessionCompassReport;
  isApproved: boolean;
  previousJourneyEntry: MentalJourneyEntry | null;
  onOpenEvidence: (segmentId: number) => void;
  onOpenMoments: () => void;
  onOpenNotes: () => void;
}) {
  const overview = report.sessionOverview;
  const centralTheme = overview.themes[0] ?? null;
  const mainInsight = overview.emergingResource?.text ?? overview.summary;
  const mainInsightEvidence = overview.emergingResource?.evidence ?? overview.summaryEvidence[0] ?? null;
  const nextStep = report.nextSessionPrep[0] ?? report.commitments[0] ?? null;
  const supportingEvidence = [
    ...overview.summaryEvidence,
    centralTheme?.evidence,
    mainInsightEvidence,
    nextStep?.evidence,
  ].filter((item): item is CompassEvidence => Boolean(item));
  const uniqueEvidence = Array.from(
    new Map(supportingEvidence.map((item) => [item.transcriptSegmentId, item])).values()
  ).slice(0, 3);

  return (
    <div className="space-y-5">
      <Surface className="overflow-hidden border-violet-200 bg-gradient-to-br from-white via-white to-violet-50/70 p-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1.5 text-sm font-bold text-violet-700">
            <Sparkles className="h-4 w-4" /> Lettura AI da verificare
          </span>
          <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
            {isApproved ? 'Approvata dal coach' : 'In attesa di validazione coach'}
          </span>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-violet-100 bg-white/90 p-5">
            <p className="text-sm font-bold text-violet-700">Problema centrale</p>
            <p className="mt-2 text-lg font-bold leading-7 text-gray-950">{centralTheme?.text ?? 'Dato non disponibile'}</p>
            <p className="mt-2 text-base leading-7 text-gray-600">Tema emerso dalla conversazione; non è una diagnosi.</p>
            {centralTheme ? <EvidenceButton evidence={centralTheme.evidence} onOpenEvidence={onOpenEvidence} /> : null}
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
            <p className="text-sm font-bold text-emerald-800">Insight principale · inferenza AI</p>
            <p className="mt-2 text-lg font-bold leading-7 text-emerald-950">{mainInsight || 'Dato non disponibile'}</p>
            <p className="mt-2 text-base leading-7 text-emerald-900">Da confrontare con il giudizio del coach, non presentato come fatto.</p>
            {mainInsightEvidence ? <EvidenceButton evidence={mainInsightEvidence} onOpenEvidence={onOpenEvidence} /> : null}
          </div>
          <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-5">
            <p className="text-sm font-bold text-sky-800">Prossimo passo suggerito</p>
            <p className="mt-2 text-lg font-bold leading-7 text-sky-950">{nextStep?.text ?? 'Dato non disponibile'}</p>
            <p className="mt-2 text-base leading-7 text-sky-900">{nextStep ? 'Azione già presente nel report, da decidere e validare dal coach.' : 'Non è stata definita un’azione verificabile.'}</p>
            {nextStep ? <EvidenceButton evidence={nextStep.evidence} onOpenEvidence={onOpenEvidence} /> : null}
          </div>
        </div>
        {uniqueEvidence.length ? (
          <div className="mt-5">
            <p className="text-sm font-bold text-gray-800">Estratti a supporto dell’interpretazione</p>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              {uniqueEvidence.map((evidence) => <EvidenceButton key={`${evidence.transcriptSegmentId}-${evidence.startMs}`} evidence={evidence} onOpenEvidence={onOpenEvidence} />)}
            </div>
          </div>
        ) : null}
      </Surface>

      {(overview.emotionalTrend?.length ?? 0) > 0 ? <EmotionalTrendChart points={overview.emotionalTrend ?? []} onOpenEvidence={onOpenEvidence} /> : null}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Surface>
          <SectionHeading
            eyebrow="Su cosa avete lavorato"
            title="Temi della sessione"
            description="Elementi emersi dalla conversazione e sostenuti dalla trascrizione."
          />
          {overview.themes.length ? (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {overview.themes.map((theme) => (
                <li key={theme.id} className="rounded-xl bg-gray-50 p-4">
                  <div className="flex items-start gap-3">
                    <Target className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                    <p className="text-sm font-semibold leading-6 text-gray-900">{theme.text}</p>
                  </div>
                  <EvidenceButton evidence={theme.evidence} onOpenEvidence={onOpenEvidence} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState text="Nessun tema è stato identificato con evidenza sufficiente." />
          )}
        </Surface>

        <Surface>
          <SectionHeading eyebrow="Takeaway" title="Risorsa emersa" />
          {overview.emergingResource ? (
            <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <Lightbulb className="h-5 w-5 text-emerald-700" />
              <p className="mt-3 text-sm leading-6 text-emerald-950">
                {overview.emergingResource.text}
              </p>
              <EvidenceButton
                evidence={overview.emergingResource.evidence}
                onOpenEvidence={onOpenEvidence}
              />
            </div>
          ) : (
            <EmptyState text="Nessuna risorsa è emersa con evidenza sufficiente." />
          )}
        </Surface>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Surface>
          <div className="flex items-start justify-between gap-4">
            <SectionHeading
              eyebrow="Punti di svolta"
              title="Momenti chiave"
              description="I passaggi più rilevanti della conversazione."
            />
            {report.keyMoments.length ? (
              <Button type="button" variant="outline" size="sm" onClick={onOpenMoments}>
                Vedi tutti
              </Button>
            ) : null}
          </div>
          {report.keyMoments.length ? (
            <ol className="mt-5 space-y-4">
              {report.keyMoments.slice(0, 2).map((moment) => (
                <li key={moment.id} className="relative border-l-2 border-violet-200 pl-4">
                  <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-violet-600" />
                  <p className="text-sm font-semibold text-violet-700">{formatTranscriptTimestamp(moment.evidence.startMs)}</p>
                  <p className="mt-1 text-sm font-bold text-gray-950">{moment.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-gray-600">
                    {moment.explanation}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState text="Nessun momento chiave è stato identificato." />
          )}
        </Surface>

        <Surface>
          <div className="flex items-start justify-between gap-4">
            <SectionHeading
              eyebrow="Follow-up"
              title="Azioni per la prossima sessione"
              description="Impegni e punti da riprendere già presenti nel report."
            />
            <Button type="button" variant="outline" size="sm" onClick={onOpenNotes}>
              Gestisci
            </Button>
          </div>
          {report.nextSessionPrep.length ? (
            <ul className="mt-5 space-y-3">
              {report.nextSessionPrep.map((item) => (
                <li key={item.id} className="flex gap-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-800">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="leading-6">{item.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState text="Non sono state definite azioni per la prossima sessione." />
          )}
        </Surface>
      </div>

      <SessionContinuityCard report={report} previous={previousJourneyEntry} />
    </div>
  );
}

export function SessionJourney({
  report,
  trackedCommitments,
  onOpenEvidence,
}: {
  report: SessionCompassReport;
  trackedCommitments: readonly TrackedCommitmentView[];
  onOpenEvidence: (segmentId: number) => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
      <Surface>
        <SectionHeading
          eyebrow="Sessione corrente"
          title="Filo logico disponibile oggi"
          description="La sequenza usa soltanto contenuti presenti e verificabili nel report corrente."
        />
        <ol className="mt-6 space-y-5">
          <JourneyStep
            number="1"
            title="Temi emersi"
            text={
              report.sessionOverview.themes.map((theme) => theme.text).join(' · ') ||
              'Nessun tema identificato con evidenza sufficiente.'
            }
          />
          <JourneyStep
            number="2"
            title="Momenti rilevanti"
            text={
              report.keyMoments.map((moment) => moment.title).join(' · ') ||
              'Nessun momento chiave identificato.'
            }
          />
          <JourneyStep
            number="3"
            title="Prossima direzione da verificare"
            text={
              report.nextSessionPrep.map((item) => item.text).join(' · ') ||
              'Nessuna preparazione proposta nel report.'
            }
          />
        </ol>
      </Surface>
      <Surface>
        <SectionHeading
          eyebrow="Storico atleta"
          title="Confronto tra sessioni"
          description="La timeline completa e i confronti con le sessioni precedenti appartengono alla fase successiva."
        />
        <div className="mt-5 rounded-xl border border-dashed border-violet-200 bg-violet-50/60 p-5">
          <Compass className="h-6 w-6 text-violet-600" />
          <p className="mt-3 text-sm font-semibold text-gray-900">
            Nessuna sessione precedente caricata in questa pagina.
          </p>
          <p className="mt-1 text-sm leading-6 text-gray-600">
            Il sistema non genera confronti finché non consulta lo storico approvato dello stesso atleta.
          </p>
        </div>
        {trackedCommitments.length ? (
          <div className="mt-5">
            <p className="text-sm font-bold text-gray-950">Follow-through attuale</p>
            <p className="mt-1 text-sm text-gray-600">
              {trackedCommitments.length} {trackedCommitments.length === 1 ? 'impegno operativo' : 'impegni operativi'} collegati alla sessione.
            </p>
          </div>
        ) : null}
      </Surface>
    </div>
  );
}

function JourneyStep({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
        {number}
      </span>
      <div>
        <p className="text-sm font-bold text-gray-950">{title}</p>
        <p className="mt-1 text-sm leading-6 text-gray-600">{text}</p>
      </div>
    </li>
  );
}

export function KeyMomentsPanel({
  report,
  journey,
  currentSessionId,
  onOpenEvidence,
  onOpenTranscript,
}: {
  report: SessionCompassReport;
  journey: MentalJourney | null;
  currentSessionId: number;
  onOpenEvidence: (segmentId: number) => void;
  onOpenTranscript: (sessionId: number, segmentId?: number) => void;
}) {
  const [speaker, setSpeaker] = useState<'all' | CompassSpeaker>('all');
  const [category, setCategory] = useState<'all' | KeyMomentCategory>('all');
  const [theme, setTheme] = useState('all');
  const [action, setAction] = useState('all');
  const [minimumRelevance, setMinimumRelevance] = useState('all');
  const themes = useMemo(
    () =>
      Array.from(
        new Set(
          report.keyMoments
            .map((moment) => moment.theme?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ).sort((left, right) => left.localeCompare(right, 'it')),
    [report.keyMoments]
  );
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          report.keyMoments
            .map((moment) => moment.category)
            .filter((value): value is KeyMomentCategory => Boolean(value))
        )
      ),
    [report.keyMoments]
  );
  const filteredMoments = useMemo(
    () =>
      report.keyMoments.filter(
        (moment) =>
          (speaker === 'all' || moment.speaker === speaker) &&
          (category === 'all' || moment.category === category) &&
          (theme === 'all' || moment.theme === theme) &&
          (action === 'all' ||
            (action === 'with_action') === Boolean(moment.category && ACTIONABLE_MOMENT_CATEGORIES.has(moment.category))) &&
          (minimumRelevance === 'all' ||
            (moment.relevance ?? 0) >= Number(minimumRelevance))
      ),
    [action, category, minimumRelevance, report.keyMoments, speaker, theme]
  );
  const similarHistoricalMoments = useMemo(() => {
    if (!journey || !filteredMoments.length) return [];
    const selectedCategories = new Set(
      filteredMoments
        .map((moment) => moment.category)
        .filter((value): value is KeyMomentCategory => Boolean(value))
    );
    const selectedThemes = new Set(
      filteredMoments
        .map((moment) => moment.theme?.trim().toLocaleLowerCase('it'))
        .filter((value): value is string => Boolean(value))
    );
    if (!selectedCategories.size && !selectedThemes.size) return [];

    return journey.timeline
      .filter((entry) => entry.sessionId !== currentSessionId)
      .flatMap((entry) =>
        entry.keyMoments.map((moment) => ({
          ...moment,
          sessionId: entry.sessionId,
          sessionDate: entry.sessionDate,
          focus: entry.focus,
        }))
      )
      .filter(
        (moment) =>
          (moment.category ? selectedCategories.has(moment.category) : false) ||
          (moment.theme
            ? selectedThemes.has(moment.theme.trim().toLocaleLowerCase('it'))
            : false)
      )
      .slice(0, 6);
  }, [currentSessionId, filteredMoments, journey]);

  return (
    <div className="space-y-5">
      <Surface>
        <SectionHeading
          eyebrow="Timeline della sessione"
          title="Momenti chiave"
          description="Filtra i passaggi importanti e apri sempre l’evidenza precisa nella trascrizione."
        />
        {report.keyMoments.length ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <FilterSelect label="Speaker" value={speaker} onChange={(value) => setSpeaker(value as 'all' | CompassSpeaker)}>
                <option value="all">Tutti</option>
                <option value="coach">Coach</option>
                <option value="athlete">Atleta</option>
              </FilterSelect>
              <FilterSelect label="Categoria" value={category} onChange={(value) => setCategory(value as 'all' | KeyMomentCategory)}>
                <option value="all">Tutte</option>
                {categories.map((value) => (
                  <option key={value} value={value}>{MOMENT_CATEGORY_LABEL[value]}</option>
                ))}
              </FilterSelect>
              <FilterSelect label="Tema" value={theme} onChange={setTheme}>
                <option value="all">Tutti</option>
                {themes.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </FilterSelect>
              <FilterSelect label="Azione" value={action} onChange={setAction}>
                <option value="all">Tutte</option>
                <option value="with_action">Con azione operativa</option>
                <option value="without_action">Senza azione operativa</option>
              </FilterSelect>
              <FilterSelect label="Rilevanza minima" value={minimumRelevance} onChange={setMinimumRelevance}>
                <option value="all">Qualsiasi</option>
                <option value="1">1 — utile</option>
                <option value="2">2 — importante</option>
                <option value="3">3 — decisivo</option>
              </FilterSelect>
            </div>
            {filteredMoments.length ? (
              <ol className="mt-6 space-y-5">
                {filteredMoments.map((moment) => (
                  <li key={moment.id} className="grid gap-3 sm:grid-cols-[5rem_1fr]">
                    <div className="flex items-center gap-2 text-sm font-bold text-violet-700 sm:items-start">
                      <Clock3 className="h-4 w-4" /> {formatTranscriptTimestamp(moment.evidence.startMs)}
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-gray-950">{moment.title}</p>
                        <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-gray-600">
                          {SPEAKER_LABEL[moment.speaker]}
                        </span>
                        {moment.category ? <MomentTag>{MOMENT_CATEGORY_LABEL[moment.category]}</MomentTag> : null}
                        {moment.theme ? <MomentTag>{moment.theme}</MomentTag> : null}
                        {moment.relevance ? <MomentTag>Rilevanza {moment.relevance}/3</MomentTag> : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-gray-700">{moment.explanation}</p>
                      <EvidenceButton evidence={moment.evidence} onOpenEvidence={onOpenEvidence} />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState text="Nessun momento corrisponde ai filtri selezionati." />
            )}
          </>
        ) : (
          <EmptyState text="Nessun momento chiave è stato identificato con evidenza sufficiente." />
        )}
      </Surface>

      {similarHistoricalMoments.length ? (
        <Surface>
          <SectionHeading
            eyebrow="Continuità"
            title="Momenti simili nello storico"
            description="Passaggi di sessioni precedenti che condividono tema o categoria con la selezione attuale."
          />
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {similarHistoricalMoments.map((moment) => (
              <button
                key={`${moment.sessionId}-${moment.id}`}
                type="button"
                className="rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-violet-300 hover:bg-violet-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                onClick={() => onOpenTranscript(moment.sessionId, moment.transcriptSegmentId)}
              >
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
                  {formatCompactDate(moment.sessionDate)}
                </span>
                <span className="mt-1 block font-bold text-gray-950">{moment.title}</span>
                <span className="mt-1 block text-sm leading-5 text-gray-600">{moment.focus ?? moment.explanation}</span>
              </button>
            ))}
          </div>
        </Surface>
      ) : null}
    </div>
  );
}

const MOMENT_CATEGORY_LABEL: Record<KeyMomentCategory, string> = {
  turning_point: 'Svolta',
  resistance: 'Resistenza',
  awareness: 'Consapevolezza',
  goal: 'Obiettivo',
  exercise: 'Esercizio',
  commitment: 'Impegno',
  risk: 'Punto di attenzione',
  follow_up: 'Da riprendere',
};

const ACTIONABLE_MOMENT_CATEGORIES = new Set<KeyMomentCategory>([
  'goal',
  'exercise',
  'commitment',
  'follow_up',
]);

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="text-sm font-semibold text-gray-700">
      {label}
      <select
        className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function MomentTag({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold text-violet-700">{children}</span>;
}

function formatCompactDate(value: string | null): string {
  if (!value) return 'Sessione precedente';
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

export function CoachNotesPanel({
  report,
  editable,
  reportEditable,
  trackedCommitments,
  coachNote,
  busy,
  onCoachNoteChange,
  onSaveCoachNote,
  onCommitmentChange,
  onTrackedCommitmentChange,
  onOpenEvidence,
}: {
  report: SessionCompassReport;
  editable: boolean;
  reportEditable: boolean;
  trackedCommitments: readonly TrackedCommitmentView[];
  coachNote: string;
  busy: boolean;
  onCoachNoteChange: (value: string) => void;
  onSaveCoachNote: () => void;
  onCommitmentChange: (
    commitmentId: string,
    change: { text?: string; owner?: CompassSpeaker; status?: CommitmentStatus }
  ) => void;
  onTrackedCommitmentChange: (commitmentId: number, change: TrackedCommitmentChange) => void;
  onOpenEvidence: (segmentId: number) => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <Surface>
        <SectionHeading
          eyebrow="Privato"
          title="Appunti del coach"
          description="Queste note non sono visibili all’atleta e una rigenerazione AI non le sovrascrive."
        />
        <label className="mt-5 block">
          <span className="sr-only">Nota privata del coach</span>
          <textarea
            className="min-h-56 w-full resize-y rounded-xl border border-gray-200 bg-gray-50/60 p-4 text-sm leading-6 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            aria-label="Nota del coach"
            value={coachNote}
            disabled={!editable}
            onChange={(event) => onCoachNoteChange(event.target.value)}
            placeholder="Aggiungi osservazioni private, ipotesi da verificare o punti da riprendere…"
          />
        </label>
        {editable ? (
          <Button type="button" className="mt-3" disabled={busy} onClick={onSaveCoachNote}>
            Salva nota
          </Button>
        ) : null}
      </Surface>

      <Surface>
        <SectionHeading
          eyebrow="Follow-up"
          title="Azioni per la prossima sessione"
          description="Le modifiche manuali del coach prevalgono sempre sulla bozza AI."
        />
        <div className="mt-5">
          {trackedCommitments.length ? (
            <TrackedCommitmentsSection
              commitments={trackedCommitments}
              onChange={onTrackedCommitmentChange}
              onOpenEvidence={onOpenEvidence}
            />
          ) : report.commitments.length ? (
            <ul className="space-y-3">
              {report.commitments.map((commitment) => (
                <CommitmentRow
                  key={commitment.id}
                  commitment={commitment}
                  editable={reportEditable}
                  onChange={(change) => onCommitmentChange(commitment.id, change)}
                  onOpenEvidence={onOpenEvidence}
                />
              ))}
            </ul>
          ) : (
            <EmptyState text="Non sono state definite azioni operative in questa sessione." />
          )}
        </div>
      </Surface>
    </div>
  );
}

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
    <section>
      <h4 className="text-sm font-bold text-gray-950">Impegni attivi</h4>
      <p className="mt-1 text-sm text-gray-600">
        Sincronizzati all’approvazione. Le tue modifiche prevalgono sulla bozza AI.
      </p>
      <ul className="mt-4 space-y-3">
        {commitments.map((commitment) => (
        <li key={commitment.id} className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 text-sm text-gray-800">
          <label className="block">
            <span className="sr-only">Testo dell’impegno</span>
            <input
              type="text"
              className="min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
              defaultValue={commitment.title}
              onBlur={(event) =>
                event.target.value.trim() && event.target.value !== commitment.title
                  ? onChange?.(commitment.id, { title: event.target.value })
                  : undefined
              }
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5">
              <span className="text-gray-500">Responsabile</span>
              <select
                className="min-h-9 rounded-lg border border-gray-200 bg-white px-2"
                value={commitment.owner}
                onChange={(event) => onChange?.(commitment.id, { owner: event.target.value as CompassSpeaker })}
              >
                <option value="coach">Coach</option>
                <option value="athlete">Atleta</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-gray-500">Stato</span>
              <select
                className="min-h-9 rounded-lg border border-gray-200 bg-white px-2"
                value={commitment.status}
                onChange={(event) => onChange?.(commitment.id, { status: event.target.value as TrackedCommitmentStatus })}
              >
                {TRACKED_STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>{TRACKED_STATUS_LABEL[status]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-gray-500">Scadenza</span>
              <input
                type="date"
                className="min-h-9 rounded-lg border border-gray-200 bg-white px-2"
                defaultValue={commitment.dueDate ?? ''}
                onChange={(event) => onChange?.(commitment.id, { dueDate: event.target.value || null })}
              />
            </label>
          </div>
          {commitment.status === 'completed' ? (
            <p className="mt-3 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
              L’atleta ha completato questo impegno
            </p>
          ) : null}
          {commitment.status === 'skipped' ? (
            <div className="mt-3">
              <p className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                L’atleta non è riuscito a completarlo
              </p>
              {commitment.athleteNote ? <p className="mt-2 text-sm text-gray-700">«{commitment.athleteNote}»</p> : null}
            </div>
          ) : null}
          {commitment.manuallyEdited ? (
            <p className="mt-2 text-xs font-medium text-gray-500">Modificato manualmente</p>
          ) : null}
          <button
            type="button"
            className="mt-3 flex w-full items-start gap-2 rounded-lg border border-gray-200 bg-white p-2.5 text-left text-xs text-gray-600 hover:border-violet-300"
            disabled={commitment.sourceTranscriptSegmentId === null}
            onClick={() =>
              commitment.sourceTranscriptSegmentId !== null
                ? onOpenEvidence?.(commitment.sourceTranscriptSegmentId)
                : undefined
            }
          >
            <MessageSquareQuote className="h-4 w-4 shrink-0 text-violet-500" />
            <span>
              <strong className="text-gray-800">{formatTranscriptTimestamp(commitment.sourceTimestampMs)}</strong>
              <span className="mt-1 block italic">«{commitment.sourceExcerpt}»</span>
            </span>
          </button>
        </li>
        ))}
      </ul>
    </section>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
      <ListChecks className="mx-auto h-5 w-5 text-gray-400" />
      <p className="mt-2 text-sm text-gray-600">{text}</p>
    </div>
  );
}

/** Compatibilità con i test e con eventuali import interni precedenti. */
export function SessionCompassContent({
  report,
  editable = false,
  hideCommitments = false,
  onOpenEvidence,
  onCommitmentChange,
}: {
  report: SessionCompassReport;
  editable?: boolean;
  hideCommitments?: boolean;
  onOpenEvidence?: (segmentId: number) => void;
  onCommitmentChange?: (
    commitmentId: string,
    change: { text?: string; owner?: CompassSpeaker; status?: CommitmentStatus }
  ) => void;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-bold text-gray-950">Sintesi della sessione</h3>
        <p className="mt-2 rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-800">
          {report.sessionOverview.summary}
        </p>
        {report.sessionOverview.summaryEvidence.map((item) => (
          <EvidenceButton
            key={`summary-${item.transcriptSegmentId}-${item.startMs}`}
            evidence={item}
            onOpenEvidence={onOpenEvidence}
          />
        ))}
      </section>
      {report.sessionOverview.themes.length ? (
        <section>
          <h3 className="font-bold text-gray-950">Temi emersi</h3>
          <ul className="mt-3 space-y-3">
            {report.sessionOverview.themes.map((theme) => (
              <li key={theme.id} className="rounded-xl bg-gray-50 p-3 text-sm">
                {theme.text}
                <EvidenceButton evidence={theme.evidence} onOpenEvidence={onOpenEvidence} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {report.sessionOverview.emergingResource ? (
        <section>
          <h3 className="font-bold text-gray-950">Risorsa emersa</h3>
          <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm">
            {report.sessionOverview.emergingResource.text}
          </p>
        </section>
      ) : null}
      {report.keyMoments.length ? (
        <section>
          <h3 className="font-bold text-gray-950">Momenti chiave</h3>
        </section>
      ) : null}
      {!hideCommitments && report.commitments.length ? (
        <section>
          <h3 className="font-bold text-gray-950">Impegni concordati</h3>
          <ul className="mt-3 space-y-3">
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
        </section>
      ) : null}
      {report.nextSessionPrep.length ? (
        <section><h3 className="font-bold text-gray-950">Preparazione prossima sessione</h3></section>
      ) : null}
    </div>
  );
}
