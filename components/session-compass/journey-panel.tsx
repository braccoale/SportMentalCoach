'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock3,
  FileText,
  History,
  Lightbulb,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AthleteJourneySidebar } from './athlete-journey-sidebar';
import { AthleteProgressCharts } from './charts';
import { compareSessionMetrics, metricDeltaSentence } from './metric-model';
import { DashboardEmptyState } from './ui';
import type {
  MentalJourney,
  MentalJourneyEntry,
  RecurringTheme,
} from '@/lib/core/ai-session-notes/mental-journey';
import type { SessionCompassReport } from '@/lib/core/ai-session-notes/session-compass-contract';
import type { TrackedCommitmentView } from './types';

type ThemeComparison = {
  common: string[];
  newInCurrent: string[];
  noLongerPresent: string[];
};

function normalizedTheme(value: string): string {
  return value
    .toLocaleLowerCase('it')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function compareJourneyThemes(
  currentThemes: readonly string[],
  previousThemes: readonly string[]
): ThemeComparison {
  const previousByKey = new Map(previousThemes.map((theme) => [normalizedTheme(theme), theme]));
  const currentByKey = new Map(currentThemes.map((theme) => [normalizedTheme(theme), theme]));
  return {
    common: currentThemes.filter((theme) => previousByKey.has(normalizedTheme(theme))),
    newInCurrent: currentThemes.filter((theme) => !previousByKey.has(normalizedTheme(theme))),
    noLongerPresent: previousThemes.filter((theme) => !currentByKey.has(normalizedTheme(theme))),
  };
}

function timestamp(entry: MentalJourneyEntry): number {
  return new Date(entry.sessionDate ?? entry.approvedAt).getTime();
}

export function selectPreviousJourneyEntry(
  timeline: readonly MentalJourneyEntry[],
  currentSessionId: number,
  currentSessionDate: string | null
): MentalJourneyEntry | null {
  const ordered = timeline.slice().sort((left, right) => timestamp(right) - timestamp(left));
  const currentIndex = ordered.findIndex((entry) => entry.sessionId === currentSessionId);
  if (currentIndex >= 0) return ordered[currentIndex + 1] ?? null;
  const currentTime = currentSessionDate ? new Date(currentSessionDate).getTime() : Number.NaN;
  if (Number.isFinite(currentTime)) {
    return ordered.find((entry) => timestamp(entry) < currentTime) ?? null;
  }
  return ordered[0] ?? null;
}

function formatDate(value: string | null): string {
  if (!value) return 'Data non disponibile';
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function Surface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 max-w-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

function EmptyComparison() {
  return (
    <DashboardEmptyState
      className="mt-4"
      icon={<History className="h-4 w-4" />}
      title="Questa è la prima sessione analizzata"
      description="I confronti saranno disponibili dai prossimi incontri approvati."
    />
  );
}

export function SessionContinuityCard({
  report,
  previous,
  className = '',
}: {
  report: SessionCompassReport;
  previous: MentalJourneyEntry | null;
  className?: string;
}) {
  if (!previous) {
    return (
      <Surface className={className}>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">Continuità</p>
        <h3 className="mt-1 text-base font-bold text-gray-950">Continuità con la sessione precedente</h3>
        <EmptyComparison />
      </Surface>
    );
  }

  const comparison = compareJourneyThemes(
    report.sessionOverview.themes.map((theme) => theme.text),
    previous.themes
  );
  const metricComparison = compareSessionMetrics(
    report.sessionOverview.metrics ?? [],
    previous.metrics ?? []
  );
  // Le tre colonne usano solo confronti reali: una metrica comparabile o un
  // tema presente in entrambi i report. Nessuna colonna viene riempita per
  // simmetria.
  const changed = metricComparison
    .filter((item) => item.direction !== 'stable')
    .map(metricDeltaSentence);
  const stable = [
    ...metricComparison.filter((item) => item.direction === 'stable').map(metricDeltaSentence),
    ...comparison.common,
  ];
  const completedCommitments = previous.commitments.filter(
    (commitment) => commitment.status === 'completed'
  );
  const openCommitments = previous.commitments.filter(
    (commitment) => commitment.status === 'pending' || commitment.status === 'in_progress'
  );

  return (
    <Surface className={className}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">Continuità</p>
          <h3 className="mt-1 text-base font-bold text-gray-950">Continuità con la sessione precedente</h3>
        </div>
        <p className="text-xs text-gray-500">Confronto con {formatDate(previous.sessionDate)}</p>
      </div>
      <div className="mt-4 grid items-start gap-3 md:grid-cols-3">
        <ComparisonColumn
          tone="emerald"
          title="Cosa è cambiato"
          items={changed}
          empty="Non ci sono metriche comparabili sufficienti per identificare un cambiamento."
        />
        <ComparisonColumn
          tone="amber"
          title="Cosa è rimasto stabile"
          items={stable}
          empty="Non ci sono dati comparabili sufficienti per identificare elementi rimasti stabili."
        />
        <ComparisonColumn
          tone="violet"
          title="Cosa è emerso di nuovo"
          items={comparison.newInCurrent}
          empty="Nessun nuovo tema esplicito nel report corrente."
        />
      </div>

      {previous.commitments.length ? (
        <div className="mt-3 grid items-start gap-3 sm:grid-cols-2">
          <CommitmentColumn
            tone="emerald"
            title={`Impegni completati (${completedCommitments.length})`}
            items={completedCommitments.map((commitment) => commitment.title)}
            empty="Nessun impegno della sessione precedente risulta completato."
          />
          <CommitmentColumn
            tone="amber"
            title={`Impegni ancora aperti (${openCommitments.length})`}
            items={openCommitments.map((commitment) => commitment.title)}
            empty="Nessun impegno della sessione precedente è rimasto aperto."
          />
        </div>
      ) : null}
    </Surface>
  );
}

function CommitmentColumn({
  tone,
  title,
  items,
  empty,
}: {
  tone: 'emerald' | 'amber';
  title: string;
  items: readonly string[];
  empty: string;
}) {
  const tones = {
    emerald: 'border-emerald-100 bg-emerald-50/50 text-emerald-900',
    amber: 'border-amber-100 bg-amber-50/50 text-amber-950',
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <p className="text-sm font-bold">{title}</p>
      {items.length ? (
        <ul className="mt-2 space-y-1 text-sm leading-5">
          {items.slice(0, 3).map((item) => (
            <li key={item} className="line-clamp-2">{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-5 opacity-75">{empty}</p>
      )}
    </div>
  );
}

function ComparisonColumn({
  tone,
  title,
  items,
  empty,
}: {
  tone: 'emerald' | 'amber' | 'violet';
  title: string;
  items: readonly string[];
  empty: string;
}) {
  const tones = {
    emerald: 'border-emerald-100 bg-emerald-50/70 text-emerald-900',
    amber: 'border-amber-100 bg-amber-50/70 text-amber-950',
    violet: 'border-violet-100 bg-violet-50/70 text-violet-950',
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-sm font-bold">{title}</p>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm leading-5">
          {items.map((item) => (
            <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-5 opacity-75">{empty}</p>
      )}
    </div>
  );
}

export function AthleteJourneyPanel({
  journey,
  report,
  isApproved,
  currentSessionId,
  currentSessionDate,
  athleteName,
  trackedCommitments,
  onOpenTranscript,
}: {
  journey: MentalJourney | null;
  report: SessionCompassReport;
  isApproved: boolean;
  currentSessionId: number;
  currentSessionDate: string | null;
  athleteName: string;
  trackedCommitments: readonly TrackedCommitmentView[];
  onOpenTranscript: (sessionId: number, segmentId?: number) => void;
}) {
  const timeline = journey?.timeline ?? [];
  const previous = selectPreviousJourneyEntry(timeline, currentSessionId, currentSessionDate);
  const pastSessions = timeline.filter((entry) => entry.sessionId !== currentSessionId);
  const [selectedId, setSelectedId] = useState<number | null>(previous?.sessionId ?? pastSessions[0]?.sessionId ?? null);
  const selected = pastSessions.find((entry) => entry.sessionId === selectedId) ?? null;
  const currentThemes = report.sessionOverview.themes.map((theme) => theme.text);
  const comparison = selected ? compareJourneyThemes(currentThemes, selected.themes) : null;

  return (
    <div className="min-w-0 space-y-5">
      <div className="grid gap-5 xl:grid-cols-[17rem_minmax(0,1fr)]">
        <AthleteJourneySidebar
          timeline={timeline}
          currentSessionId={currentSessionId}
          currentSessionDate={currentSessionDate}
          currentFocus={report.sessionOverview.themes[0]?.text ?? null}
          currentIsApproved={isApproved}
          selectedId={selectedId}
          onSelect={setSelectedId}
          className="h-fit xl:sticky xl:top-4"
        />
        <SessionComparison
          athleteName={athleteName}
          currentThemes={currentThemes}
          currentSummary={report.sessionOverview.summary}
          currentCommitments={trackedCommitments}
          selected={selected}
          comparison={comparison}
          onOpenTranscript={onOpenTranscript}
        />
      </div>

      <AthleteProgressCharts
        journey={journey}
        report={report}
        currentSessionId={currentSessionId}
        currentSessionDate={currentSessionDate}
      />
      <ThemeEvolution journey={journey} />
      <RecurringThemes themes={journey?.recurringThemes ?? []} timeline={timeline} onOpenTranscript={onOpenTranscript} />
    </div>
  );
}

function SessionComparison({
  athleteName,
  currentThemes,
  currentSummary,
  currentCommitments,
  selected,
  comparison,
  onOpenTranscript,
}: {
  athleteName: string;
  currentThemes: readonly string[];
  currentSummary: string;
  currentCommitments: readonly TrackedCommitmentView[];
  selected: MentalJourneyEntry | null;
  comparison: ThemeComparison | null;
  onOpenTranscript: (sessionId: number, segmentId?: number) => void;
}) {
  if (!selected || !comparison) {
    return (
      <Surface>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">Confronto</p>
        <h3 className="mt-1 text-base font-bold text-gray-950">Sessione corrente e storico</h3>
        <EmptyComparison />
      </Surface>
    );
  }
  return (
    <Surface>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">Confronto in contesto</p>
          <h3 className="mt-1 text-base font-bold text-gray-950">Sessione corrente vs {formatDate(selected.sessionDate)}</h3>
          <p className="mt-1 text-sm text-gray-600">Storico approvato di {athleteName}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={selected.compassHref}>Apri report completo</Link>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenTranscript(selected.sessionId)}>
            <FileText className="h-4 w-4" /> Apri trascrizione passata
          </Button>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <CompareCard label={formatDate(selected.sessionDate)} text={selected.summary} themes={selected.themes} />
        <CompareCard label="Sessione corrente" text={currentSummary} themes={currentThemes} current />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniList title="Temi comuni" items={comparison.common} empty="Nessun tema comune esplicito" />
        <MiniList title="Temi nuovi" items={comparison.newInCurrent} empty="Nessun tema nuovo esplicito" />
        <MiniList title="Da verificare" items={comparison.noLongerPresent} empty="Nessun tema uscito dal report" />
      </div>
      <div className="mt-4 rounded-xl bg-gray-50 p-4">
        <p className="text-sm font-bold text-gray-950">Azioni collegate</p>
        <p className="mt-1 text-sm text-gray-600">
          {selected.commitments.length} dalla sessione selezionata · {currentCommitments.length} dalla sessione corrente.
        </p>
      </div>
      {selected.keyMoments.length ? (
        <div className="mt-5">
          <p className="text-sm font-bold text-gray-950">Momenti chiave della sessione selezionata</p>
          <ol className="mt-3 grid gap-3 sm:grid-cols-2">
            {selected.keyMoments.map((moment) => (
              <li key={moment.id} className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-violet-700">{moment.speaker === 'coach' ? 'Coach' : 'Atleta'} · secondo non disponibile nello storico</p>
                <p className="mt-1 text-sm font-bold text-gray-950">{moment.title}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-gray-600">{moment.explanation}</p>
                <button
                  type="button"
                  className="mt-3 text-sm font-semibold text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  onClick={() => onOpenTranscript(selected.sessionId, moment.transcriptSegmentId)}
                >
                  Vai al punto della trascrizione
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </Surface>
  );
}

function CompareCard({ label, text, themes, current = false }: { label: string; text: string; themes: readonly string[]; current?: boolean }) {
  return (
    <article className={`rounded-xl border p-4 ${current ? 'border-violet-200 bg-violet-50/50' : 'border-gray-200 bg-gray-50'}`}>
      <p className={`text-xs font-bold ${current ? 'text-violet-700' : 'text-gray-500'}`}>{label}</p>
      <p className="mt-2 text-sm leading-6 text-gray-800">{text}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {themes.map((theme) => <span key={theme} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">{theme}</span>)}
      </div>
    </article>
  );
}

function MiniList({ title, items, empty }: { title: string; items: readonly string[]; empty: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-2 text-sm leading-5 text-gray-800">{items.length ? items.join(' · ') : empty}</p>
    </div>
  );
}

function ThemeEvolution({ journey }: { journey: MentalJourney | null }) {
  const sessions = (journey?.timeline ?? []).slice().reverse();
  const themes = journey?.recurringThemes ?? [];
  return (
    <Surface>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">Matrice di evidenza</p>
          <h3 className="mt-1 text-base font-bold text-gray-950">Presenza dei temi nei report approvati</h3>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><CircleDashed className="h-4 w-4" /> Dato qualitativo, non clinico</span>
      </div>
      {!sessions.length || !themes.length ? (
        <div className="mt-5 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm leading-6 text-gray-600">
          Non ci sono abbastanza dati per mostrare un’evoluzione. Servono temi presenti in almeno due report approvati.
        </div>
      ) : (
        <div className="mt-5 min-w-0 max-w-full overflow-hidden">
          <table className="w-full table-fixed border-separate border-spacing-y-2 text-sm">
            <caption className="sr-only">Presenza dei temi ricorrenti nelle sessioni approvate</caption>
            <thead>
              <tr>
                <th scope="col" className="w-[40%] px-2 text-left text-[11px] font-semibold text-gray-500 sm:w-auto sm:px-3 sm:text-xs">Tema</th>
                {sessions.map((entry) => <th key={entry.sessionId} scope="col" className="px-1 text-center text-[10px] font-semibold leading-4 text-gray-500 sm:px-3 sm:text-xs">{formatDate(entry.sessionDate)}</th>)}
              </tr>
            </thead>
            <tbody>
              {themes.slice(0, 6).map((theme) => (
                <tr key={theme.key} className="bg-gray-50">
                  <th scope="row" className="break-words rounded-l-xl px-2 py-3 text-left text-xs font-semibold text-gray-900 sm:px-3 sm:text-sm">{theme.label}</th>
                  {sessions.map((entry, index) => {
                    const present = theme.sessionIds.includes(entry.sessionId);
                    return (
                      <td key={entry.sessionId} className={`px-1 py-3 text-center sm:px-3 ${index === sessions.length - 1 ? 'rounded-r-xl' : ''}`}>
                        <span className={`mx-auto block h-3 w-3 rounded-full ${present ? 'bg-violet-600' : 'bg-gray-200'}`}>
                          <span className="sr-only">{present ? 'Presente' : 'Non presente'}</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
        Questa matrice mostra soltanto la presenza documentata dei temi. Non attribuisce intensità e non sostituisce le metriche con evidenza mostrate nel grafico del percorso.
      </div>
    </Surface>
  );
}

function RecurringThemes({ themes, timeline, onOpenTranscript }: { themes: readonly RecurringTheme[]; timeline: readonly MentalJourneyEntry[]; onOpenTranscript: (sessionId: number, segmentId?: number) => void }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(6);
  if (!themes.length) return null;
  return (
    <Surface>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">Pattern documentati</p>
      <h3 className="mt-1 text-base font-bold text-gray-950">Temi ricorrenti</h3>
      <p className="mt-1 text-sm leading-6 text-gray-600">Conteggi reali nei report approvati, senza attribuire intensità o direzione.</p>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {themes.slice(0, visibleCount).map((theme) => {
          const open = openKey === theme.key;
          const related = timeline.filter((entry) => theme.sessionIds.includes(entry.sessionId));
          const trend = themeFrequencyTrend(theme, timeline);
          return (
            <article key={theme.key} className="rounded-xl border border-gray-200">
              <button
                type="button"
                aria-expanded={open}
                className="flex min-h-14 w-full items-center justify-between gap-4 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500"
                onClick={() => setOpenKey(open ? null : theme.key)}
              >
                <span><span className="block text-sm font-bold text-gray-950">{theme.label}</span><span className="mt-1 block text-xs text-gray-500">{theme.description} · ultima {formatDate(theme.lastSeenAt)} · {trend}</span></span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition ${open ? 'rotate-180' : ''}`} />
              </button>
              {open ? (
                <div className="border-t border-gray-100 p-4">
                  <ul className="space-y-3">
                    {related.map((entry) => {
                      const moment = entry.keyMoments.find((item) => item.theme && normalizedTheme(item.theme) === theme.key) ?? entry.keyMoments[0];
                      return (
                        <li key={entry.sessionId} className="flex flex-col gap-2 rounded-lg bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <span><span className="block text-xs font-semibold text-gray-500">{formatDate(entry.sessionDate)}</span><span className="block text-sm text-gray-800">{moment?.title ?? entry.focus ?? 'Tema presente nel report'}</span><span className="mt-1 block text-xs text-gray-500">{entry.commitments.length} {entry.commitments.length === 1 ? 'azione collegata' : 'azioni collegate'}</span></span>
                          <Button type="button" variant="outline" size="sm" onClick={() => onOpenTranscript(entry.sessionId, moment?.transcriptSegmentId)}>Apri</Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {visibleCount < themes.length ? (
        <Button type="button" variant="outline" className="mt-4" onClick={() => setVisibleCount((current) => current + 6)}>
          Mostra altri temi ({themes.length - visibleCount})
        </Button>
      ) : null}
    </Surface>
  );
}

function themeFrequencyTrend(theme: RecurringTheme, timeline: readonly MentalJourneyEntry[]): string {
  if (timeline.length < 4) return 'trend non ancora confrontabile';
  const ordered = [...timeline].sort((left, right) => Date.parse(right.sessionDate ?? '') - Date.parse(left.sessionDate ?? ''));
  const windowSize = Math.min(3, Math.floor(ordered.length / 2));
  const recentCount = ordered.slice(0, windowSize).filter((entry) => theme.sessionIds.includes(entry.sessionId)).length;
  const previousCount = ordered.slice(windowSize, windowSize * 2).filter((entry) => theme.sessionIds.includes(entry.sessionId)).length;
  if (recentCount > previousCount) return 'più ricorrente nelle sessioni recenti';
  if (recentCount < previousCount) return 'meno ricorrente nelle sessioni recenti';
  return 'frequenza stabile';
}

export function TranscriptHistoryNav({
  journey,
  currentSessionId,
  currentSessionDate,
  selectedSessionId,
  onSelect,
}: {
  journey: MentalJourney | null;
  currentSessionId: number;
  currentSessionDate: string | null;
  selectedSessionId: number;
  onSelect: (sessionId: number) => void;
}) {
  const sessions = useMemo(() => journey?.timeline.filter((entry) => entry.sessionId !== currentSessionId) ?? [], [journey, currentSessionId]);
  const [visibleCount, setVisibleCount] = useState(8);
  const visibleSessions = sessions.slice(0, visibleCount);
  return (
    <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] lg:sticky lg:top-4" aria-label="Trascrizioni disponibili">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">Trascrizioni</p>
      <h3 className="mt-1 text-sm font-bold text-gray-950">Sessione corrente e storico</h3>
      <div className="mt-4 space-y-2">
        <TranscriptNavButton current active={selectedSessionId === currentSessionId} date={formatDate(currentSessionDate)} focus="Sessione corrente" moments={null} onClick={() => onSelect(currentSessionId)} />
        {visibleSessions.map((entry) => (
          <TranscriptNavButton key={entry.sessionId} active={selectedSessionId === entry.sessionId} date={formatDate(entry.sessionDate)} focus={entry.focus ?? 'Focus non identificato'} moments={entry.keyMoments.length} onClick={() => onSelect(entry.sessionId)} />
        ))}
      </div>
      {visibleCount < sessions.length ? (
        <Button type="button" variant="outline" className="mt-3 w-full" onClick={() => setVisibleCount((current) => current + 8)}>
          Altre trascrizioni ({sessions.length - visibleCount})
        </Button>
      ) : null}
      {!sessions.length ? <p className="mt-4 text-xs leading-5 text-gray-500">Non ci sono trascrizioni passate nello storico approvato.</p> : null}
    </aside>
  );
}

function TranscriptNavButton({ current = false, active, date, focus, moments, onClick }: { current?: boolean; active: boolean; date: string; focus: string; moments: number | null; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} className={`min-h-14 w-full rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${active ? 'border-violet-200 bg-violet-50' : 'border-gray-200 hover:bg-gray-50'}`} onClick={onClick}>
      <span className={`block text-xs font-bold ${active ? 'text-violet-700' : 'text-gray-500'}`}>{current ? 'Corrente · ' : ''}{date}</span>
      <span className="mt-1 block text-sm font-semibold text-gray-900">{focus}</span>
      {moments !== null ? <span className="mt-1 flex items-center gap-1 text-xs text-gray-500"><Clock3 className="h-3.5 w-3.5" />{moments} {moments === 1 ? 'momento chiave' : 'momenti chiave'}</span> : null}
    </button>
  );
}
