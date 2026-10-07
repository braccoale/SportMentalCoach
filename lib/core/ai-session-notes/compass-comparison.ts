import type {
  CompassEvidence,
  SessionCompassReport,
} from './session-compass-contract';

/**
 * Le misure con cui si confrontano due generazioni dello stesso riepilogo.
 *
 * Solo numeri e nomi di sezione, mai testo della seduta: il confronto gira su
 * sedute vere e quello che stampa può finire in un terminale condiviso o in un
 * log, come `pipeline-log.ts`.
 *
 * Un riepilogo povero non dà nessun errore: è JSON valido e passa il contratto.
 * Per questo si contano le sezioni vuote e quanti punti distinti della seduta
 * il modello cita, invece di fidarsi che «è uscito».
 */
export type CompassMetrics = {
  temi: number;
  momentiChiave: number;
  impegni: number;
  preparazione: number;
  opportunitaMancate: number;
  paragrafiStoria: number;
  metriche: number;
  puntiAndamento: number;
  caratteriSintesi: number;
  caratteriStoria: number;
  /** Tutte le citazioni del documento, anche ripetute. */
  citazioni: number;
  /** Segmenti distinti della trascrizione citati almeno una volta. */
  segmentiCitati: number;
  /** Minuti distinti della seduta toccati da almeno una citazione. */
  minutiCitati: number;
  /** Nomi delle sezioni che sono arrivate vuote. */
  sezioniVuote: string[];
};

function evidencesOf(report: SessionCompassReport): CompassEvidence[] {
  const overview = report.sessionOverview;
  const found: Array<CompassEvidence | null | undefined> = [
    ...(overview?.summaryEvidence ?? []),
    ...(overview?.themes ?? []).map((item) => item.evidence),
    overview?.emergingResource?.evidence,
    ...(overview?.metrics ?? []).map((item) => item.evidence),
    ...(overview?.emotionalTrend ?? []).map((item) => item.evidence),
    overview?.conversationTone?.evidence,
    ...(report.story?.paragraphs ?? []).map((item) => item.evidence),
    ...(report.missedOpportunities ?? []).map((item) => item.evidence),
    ...(report.keyMoments ?? []).map((item) => item.evidence),
    ...(report.commitments ?? []).map((item) => item.evidence),
    ...(report.nextSessionPrep ?? []).map((item) => item.evidence),
  ];
  return found.filter((item): item is CompassEvidence => Boolean(item));
}

export function compassMetrics(report: SessionCompassReport): CompassMetrics {
  const overview = report.sessionOverview;
  const evidences = evidencesOf(report);
  const paragraphs = report.story?.paragraphs ?? [];

  const metrics: CompassMetrics = {
    temi: overview?.themes?.length ?? 0,
    momentiChiave: report.keyMoments?.length ?? 0,
    impegni: report.commitments?.length ?? 0,
    preparazione: report.nextSessionPrep?.length ?? 0,
    opportunitaMancate: report.missedOpportunities?.length ?? 0,
    paragrafiStoria: paragraphs.length,
    metriche: overview?.metrics?.length ?? 0,
    puntiAndamento: overview?.emotionalTrend?.length ?? 0,
    caratteriSintesi: overview?.summary?.length ?? 0,
    caratteriStoria: paragraphs.reduce((sum, item) => sum + (item.text?.length ?? 0), 0),
    citazioni: evidences.length,
    segmentiCitati: new Set(evidences.map((item) => item.transcriptSegmentId)).size,
    minutiCitati: new Set(evidences.map((item) => item.minute)).size,
    sezioniVuote: [],
  };

  const vuote: string[] = [];
  if (metrics.caratteriSintesi === 0) vuote.push('sintesi');
  if (metrics.temi === 0) vuote.push('temi');
  if (metrics.momentiChiave === 0) vuote.push('momentiChiave');
  if (metrics.preparazione === 0) vuote.push('preparazione');
  if (metrics.paragrafiStoria === 0) vuote.push('storia');
  metrics.sezioniVuote = vuote;
  return metrics;
}

/**
 * Differenze numeriche fra due generazioni, con segno: positivo vuol dire che
 * `altra` ha di più. Le sezioni vuote si confrontano come insiemi.
 */
export function compassDelta(
  base: CompassMetrics,
  altra: CompassMetrics
): { numeri: Record<string, number>; vuoteInPiu: string[]; vuoteInMeno: string[] } {
  const numeri: Record<string, number> = {};
  for (const [chiave, valore] of Object.entries(base)) {
    if (typeof valore !== 'number') continue;
    const altro = altra[chiave as keyof CompassMetrics];
    if (typeof altro === 'number') numeri[chiave] = altro - valore;
  }
  return {
    numeri,
    vuoteInPiu: altra.sezioniVuote.filter((nome) => !base.sezioniVuote.includes(nome)),
    vuoteInMeno: base.sezioniVuote.filter((nome) => !altra.sezioniVuote.includes(nome)),
  };
}
