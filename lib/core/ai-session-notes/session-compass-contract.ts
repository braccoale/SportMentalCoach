/**
 * Session Compass v1 — contratto del report post-sessione per il coach.
 *
 * Il documento non è un summary: è una lettura contestualizzata della sessione
 * in cui *ogni* insight è ancorato a un segmento di transcript. Non contiene
 * KPI psicologici, diagnosi o relazioni causali presentate come fatto.
 *
 * Questo modulo è puro: nessun I/O, nessuna dipendenza da database o rete.
 */

export const SESSION_COMPASS_REPORT_KIND = 'session_compass_v1' as const;
export const SESSION_COMPASS_SCHEMA_VERSION = '1.0' as const;

export const MAX_KEY_MOMENTS = 3;
export const MAX_THEMES = 3;
export const MAX_NEXT_SESSION_PREP = 3;
export const MAX_SESSION_METRICS = 6;
export const MAX_EMOTIONAL_TREND_POINTS = 8;
export const MAX_QUOTE_LENGTH = 240;

export type CompassSpeaker = 'coach' | 'athlete';

export const SESSION_METRIC_KEYS = [
  'energy',
  'motivation',
  'concentration',
  'emotional_management',
  'confidence',
  'pre_competition_anxiety',
] as const;
export type SessionMetricKey = (typeof SESSION_METRIC_KEYS)[number];

export const METRIC_CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type MetricConfidence = (typeof METRIC_CONFIDENCE_LEVELS)[number];

export const KEY_MOMENT_CATEGORIES = [
  'turning_point',
  'resistance',
  'awareness',
  'goal',
  'exercise',
  'commitment',
  'risk',
  'follow_up',
] as const;
export type KeyMomentCategory = (typeof KEY_MOMENT_CATEGORIES)[number];

export const COMMITMENT_STATUSES = [
  'pending',
  'in_progress',
  'done',
  'dropped',
] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

export const NEXT_SESSION_PREP_ORIGINS = [
  'theme',
  'commitment',
  'open_question',
] as const;
export type NextSessionPrepOrigin = (typeof NEXT_SESSION_PREP_ORIGINS)[number];

/** Ancoraggio obbligatorio: senza di esso l'insight viene omesso, non inventato. */
export type CompassEvidence = {
  transcriptSegmentId: number;
  startMs: number;
  /** Minuto della sessione, derivato da startMs: serve alla UI e al coach. */
  minute: number;
  speaker: CompassSpeaker;
  quote: string;
};

export type CompassTheme = {
  id: string;
  text: string;
  evidence: CompassEvidence;
};

export type CompassEmergingResource = {
  id: string;
  text: string;
  evidence: CompassEvidence;
};

/**
 * Stima operativa AI su scala 1–5, sempre ancorata a una frase esplicita.
 * Non è una misurazione clinica e l'assenza di evidenza produce assenza del dato.
 */
export type SessionMetric = {
  id: string;
  key: SessionMetricKey;
  value: number;
  confidence: MetricConfidence;
  evidence: CompassEvidence;
};

/** Punto qualitativo dell'andamento conversazionale, da -2 a +2. */
export type EmotionalTrendPoint = {
  id: string;
  value: number;
  label: string;
  evidence: CompassEvidence;
};

export type SessionOverview = {
  summary: string;
  summaryEvidence: CompassEvidence[];
  themes: CompassTheme[];
  /** Una sola leva/risorsa emersa, e solo se supportata da evidenza. */
  emergingResource: CompassEmergingResource | null;
  /** Campi additivi e opzionali per compatibilità con i report v1 già salvati. */
  metrics?: SessionMetric[];
  emotionalTrend?: EmotionalTrendPoint[];
};

export type KeyMoment = {
  id: string;
  title: string;
  explanation: string;
  speaker: CompassSpeaker;
  evidence: CompassEvidence;
  category?: KeyMomentCategory;
  theme?: string | null;
  relevance?: 1 | 2 | 3;
};

export type Commitment = {
  id: string;
  text: string;
  owner: CompassSpeaker;
  status: CommitmentStatus;
  /** Solo se una scadenza è stata detta esplicitamente. Formato YYYY-MM-DD. */
  dueDate: string | null;
  evidence: CompassEvidence;
};

export type NextSessionPrepItem = {
  id: string;
  text: string;
  origin: NextSessionPrepOrigin;
  evidence: CompassEvidence;
};

export type SessionCompassGenerationMetadata = {
  provider: string;
  model: string;
  promptVersion: string;
  contractVersion: string;
  generatedAt: string;
};

export type SessionCompassReport = {
  schemaVersion: typeof SESSION_COMPASS_SCHEMA_VERSION;
  reportKind: typeof SESSION_COMPASS_REPORT_KIND;
  sessionId: string;
  /** Fingerprint dell'intelligence sorgente: guida idempotenza e rigenerazione. */
  sourceFingerprint: string;
  language: string;
  sessionOverview: SessionOverview;
  keyMoments: KeyMoment[];
  commitments: Commitment[];
  nextSessionPrep: NextSessionPrepItem[];
  /** Campo libero del coach. L'AI non lo produce e non lo sovrascrive mai. */
  coachNote: string | null;
  generation: SessionCompassGenerationMetadata;
};

export type CompassSourceSegment = {
  transcriptSegmentId: number;
  startMs: number;
  endMs: number;
  speaker: CompassSpeaker;
  text: string;
};

export type SessionCompassValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export class SessionCompassValidationError extends Error {
  readonly issues: readonly SessionCompassValidationIssue[];

  constructor(issues: readonly SessionCompassValidationIssue[]) {
    super('INVALID_SESSION_COMPASS_REPORT');
    this.name = 'SessionCompassValidationError';
    this.issues = issues;
  }
}

/**
 * Frasi che presentano una relazione causale o clinica come fatto. Il report
 * deve restare prudente ("emerge", "l'atleta riferisce", "possibile
 * associazione da approfondire"), quindi questi testi sono rifiutati.
 */
// I confini di parola ASCII non funzionano prima di una lettera accentata,
// quindi i pattern che iniziano per accento non usano `\b`.
const FORBIDDEN_CLAIM_PATTERNS: readonly RegExp[] = [
  /è\s+causat[oa]/i,
  /\bsono\s+causat[ie]\b/i,
  /\bha\s+causato\b/i,
  /\bcausa\s+(?:dell|di)\b/i,
  /\bdovut[oa]\s+al(?:la|lo|l['’])?\b/i,
  /\bdiagnos/i,
  /\bpatolog/i,
  /\bdisturb[oi]\s+(?:di|d['’]|dell)/i,
  /\bsoffre\s+di\b/i,
  /certamente\s+perché/i,
];

export function minuteFromMs(milliseconds: number): number {
  return Math.max(0, Math.floor(milliseconds / 60_000));
}

/** Indicizza i segmenti sorgente per risoluzione e verifica delle evidenze. */
export function indexSourceSegments(
  segments: readonly CompassSourceSegment[]
): ReadonlyMap<number, CompassSourceSegment> {
  return new Map(segments.map((segment) => [segment.transcriptSegmentId, segment]));
}

/**
 * Verifica un'evidenza contro il transcript. Restituisce l'evidenza
 * normalizzata (minute ricalcolato dalla fonte) oppure `null` se non è
 * sufficientemente supportata: chi chiama omette l'insight.
 */
export function resolveEvidence(
  candidate: {
    transcriptSegmentId: unknown;
    quote: unknown;
  },
  segments: ReadonlyMap<number, CompassSourceSegment>
): CompassEvidence | null {
  if (
    typeof candidate.transcriptSegmentId !== 'number' ||
    !Number.isInteger(candidate.transcriptSegmentId)
  ) {
    return null;
  }
  const segment = segments.get(candidate.transcriptSegmentId);
  if (!segment) return null;
  if (typeof candidate.quote !== 'string') return null;
  const quote = candidate.quote.trim().slice(0, MAX_QUOTE_LENGTH);
  if (!quote) return null;
  if (!containsQuote(segment.text, quote)) return null;
  return {
    transcriptSegmentId: segment.transcriptSegmentId,
    startMs: segment.startMs,
    minute: minuteFromMs(segment.startMs),
    speaker: segment.speaker,
    quote,
  };
}

/** Confronto tollerante a spaziatura e maiuscole, non al contenuto. */
function containsQuote(segmentText: string, quote: string): boolean {
  return comparableText(segmentText).includes(comparableText(quote));
}

function comparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsForbiddenClaim(value: string): boolean {
  return FORBIDDEN_CLAIM_PATTERNS.some((pattern) => pattern.test(value));
}

export type SessionCompassValidationContext = {
  sessionId: string;
  sourceFingerprint: string;
  segments: readonly CompassSourceSegment[];
};

/**
 * Valida struttura, evidenze e prudenza del linguaggio. Non giudica il merito
 * del contenuto e non muta gli input.
 */
export function validateSessionCompassReport(
  report: SessionCompassReport,
  context: SessionCompassValidationContext
): SessionCompassValidationIssue[] {
  const issues: SessionCompassValidationIssue[] = [];
  const segments = indexSourceSegments(context.segments);
  const ids = new Set<string>();

  if (report.schemaVersion !== SESSION_COMPASS_SCHEMA_VERSION) {
    add(issues, 'UNSUPPORTED_SCHEMA_VERSION', 'schemaVersion', `Attesa versione ${SESSION_COMPASS_SCHEMA_VERSION}.`);
  }
  if (report.reportKind !== SESSION_COMPASS_REPORT_KIND) {
    add(issues, 'UNSUPPORTED_REPORT_KIND', 'reportKind', `Atteso ${SESSION_COMPASS_REPORT_KIND}.`);
  }
  if (report.sessionId !== context.sessionId) {
    add(issues, 'SESSION_REFERENCE_MISMATCH', 'sessionId', 'sessionId non corrisponde alla sessione fornita.');
  }
  if (report.sourceFingerprint !== context.sourceFingerprint) {
    add(issues, 'SOURCE_FINGERPRINT_MISMATCH', 'sourceFingerprint', 'Il fingerprint non corrisponde all’intelligence sorgente.');
  }
  requireText(report.language, 'language', issues);

  const overview = report.sessionOverview;
  requireText(overview?.summary ?? '', 'sessionOverview.summary', issues);
  requireProseSafety(overview?.summary ?? '', 'sessionOverview.summary', issues);
  if (!overview?.summaryEvidence?.length) {
    add(issues, 'MISSING_EVIDENCE', 'sessionOverview.summaryEvidence', 'La sintesi richiede almeno un’evidenza.');
  }
  for (const [index, evidence] of (overview?.summaryEvidence ?? []).entries()) {
    validateEvidence(evidence, `sessionOverview.summaryEvidence[${index}]`, segments, issues);
  }

  if ((overview?.themes ?? []).length > MAX_THEMES) {
    add(issues, 'TOO_MANY_THEMES', 'sessionOverview.themes', `Massimo ${MAX_THEMES} temi.`);
  }
  for (const [index, theme] of (overview?.themes ?? []).entries()) {
    const path = `sessionOverview.themes[${index}]`;
    requireId(theme.id, `${path}.id`, ids, issues);
    requireText(theme.text, `${path}.text`, issues);
    requireProseSafety(theme.text, `${path}.text`, issues);
    validateEvidence(theme.evidence, `${path}.evidence`, segments, issues);
  }

  if (overview?.emergingResource) {
    const path = 'sessionOverview.emergingResource';
    requireId(overview.emergingResource.id, `${path}.id`, ids, issues);
    requireText(overview.emergingResource.text, `${path}.text`, issues);
    requireProseSafety(overview.emergingResource.text, `${path}.text`, issues);
    validateEvidence(overview.emergingResource.evidence, `${path}.evidence`, segments, issues);
  }

  const metricKeys = new Set<SessionMetricKey>();
  if ((overview?.metrics ?? []).length > MAX_SESSION_METRICS) {
    add(issues, 'TOO_MANY_METRICS', 'sessionOverview.metrics', `Massimo ${MAX_SESSION_METRICS} metriche.`);
  }
  for (const [index, metric] of (overview?.metrics ?? []).entries()) {
    const path = `sessionOverview.metrics[${index}]`;
    requireId(metric.id, `${path}.id`, ids, issues);
    if (!SESSION_METRIC_KEYS.includes(metric.key)) {
      add(issues, 'INVALID_METRIC_KEY', `${path}.key`, 'Metrica non supportata.');
    } else if (metricKeys.has(metric.key)) {
      add(issues, 'DUPLICATE_METRIC_KEY', `${path}.key`, 'Ogni metrica può comparire una sola volta.');
    } else {
      metricKeys.add(metric.key);
    }
    if (!Number.isInteger(metric.value) || metric.value < 1 || metric.value > 5) {
      add(issues, 'INVALID_METRIC_VALUE', `${path}.value`, 'Il valore deve essere un intero da 1 a 5.');
    }
    if (!METRIC_CONFIDENCE_LEVELS.includes(metric.confidence)) {
      add(issues, 'INVALID_METRIC_CONFIDENCE', `${path}.confidence`, 'Confidenza non supportata.');
    }
    validateEvidence(metric.evidence, `${path}.evidence`, segments, issues);
  }

  if ((overview?.emotionalTrend ?? []).length > MAX_EMOTIONAL_TREND_POINTS) {
    add(issues, 'TOO_MANY_EMOTIONAL_POINTS', 'sessionOverview.emotionalTrend', `Massimo ${MAX_EMOTIONAL_TREND_POINTS} punti.`);
  }
  for (const [index, point] of (overview?.emotionalTrend ?? []).entries()) {
    const path = `sessionOverview.emotionalTrend[${index}]`;
    requireId(point.id, `${path}.id`, ids, issues);
    if (!Number.isInteger(point.value) || point.value < -2 || point.value > 2) {
      add(issues, 'INVALID_EMOTIONAL_VALUE', `${path}.value`, 'Il valore deve essere un intero da -2 a 2.');
    }
    requireText(point.label, `${path}.label`, issues);
    requireProseSafety(point.label, `${path}.label`, issues);
    validateEvidence(point.evidence, `${path}.evidence`, segments, issues);
  }

  if (report.keyMoments.length > MAX_KEY_MOMENTS) {
    add(issues, 'TOO_MANY_KEY_MOMENTS', 'keyMoments', `Massimo ${MAX_KEY_MOMENTS} momenti chiave.`);
  }
  for (const [index, moment] of report.keyMoments.entries()) {
    const path = `keyMoments[${index}]`;
    requireId(moment.id, `${path}.id`, ids, issues);
    requireText(moment.title, `${path}.title`, issues);
    requireText(moment.explanation, `${path}.explanation`, issues);
    requireProseSafety(moment.title, `${path}.title`, issues);
    requireProseSafety(moment.explanation, `${path}.explanation`, issues);
    if (moment.speaker !== 'coach' && moment.speaker !== 'athlete') {
      add(issues, 'INVALID_SPEAKER', `${path}.speaker`, 'Speaker non supportato.');
    }
    const evidence = validateEvidence(moment.evidence, `${path}.evidence`, segments, issues);
    if (evidence && evidence.speaker !== moment.speaker) {
      add(issues, 'SPEAKER_EVIDENCE_MISMATCH', `${path}.speaker`, 'Lo speaker non corrisponde al segmento citato.');
    }
    if (moment.category !== undefined && !KEY_MOMENT_CATEGORIES.includes(moment.category)) {
      add(issues, 'INVALID_MOMENT_CATEGORY', `${path}.category`, 'Categoria del momento non supportata.');
    }
    if (moment.theme !== undefined && moment.theme !== null) {
      requireText(moment.theme, `${path}.theme`, issues);
      requireProseSafety(moment.theme, `${path}.theme`, issues);
    }
    if (moment.relevance !== undefined && ![1, 2, 3].includes(moment.relevance)) {
      add(issues, 'INVALID_MOMENT_RELEVANCE', `${path}.relevance`, 'Rilevanza deve essere 1, 2 o 3.');
    }
  }

  for (const [index, commitment] of report.commitments.entries()) {
    const path = `commitments[${index}]`;
    requireId(commitment.id, `${path}.id`, ids, issues);
    requireText(commitment.text, `${path}.text`, issues);
    requireProseSafety(commitment.text, `${path}.text`, issues);
    if (commitment.owner !== 'coach' && commitment.owner !== 'athlete') {
      add(issues, 'INVALID_OWNER', `${path}.owner`, 'Owner deve essere coach o athlete.');
    }
    if (!COMMITMENT_STATUSES.includes(commitment.status)) {
      add(issues, 'INVALID_COMMITMENT_STATUS', `${path}.status`, 'Stato impegno non supportato.');
    }
    if (commitment.dueDate !== null && !isCalendarDate(commitment.dueDate)) {
      add(issues, 'INVALID_DUE_DATE', `${path}.dueDate`, 'La scadenza deve essere una data YYYY-MM-DD o null.');
    }
    validateEvidence(commitment.evidence, `${path}.evidence`, segments, issues);
  }

  if (report.nextSessionPrep.length > MAX_NEXT_SESSION_PREP) {
    add(issues, 'TOO_MANY_PREP_ITEMS', 'nextSessionPrep', `Massimo ${MAX_NEXT_SESSION_PREP} punti.`);
  }
  for (const [index, item] of report.nextSessionPrep.entries()) {
    const path = `nextSessionPrep[${index}]`;
    requireId(item.id, `${path}.id`, ids, issues);
    requireText(item.text, `${path}.text`, issues);
    requireProseSafety(item.text, `${path}.text`, issues);
    if (!NEXT_SESSION_PREP_ORIGINS.includes(item.origin)) {
      add(issues, 'INVALID_PREP_ORIGIN', `${path}.origin`, 'Origine non supportata.');
    }
    validateEvidence(item.evidence, `${path}.evidence`, segments, issues);
  }

  if (report.coachNote !== null && typeof report.coachNote !== 'string') {
    add(issues, 'INVALID_COACH_NOTE', 'coachNote', 'La nota del coach deve essere testo o null.');
  }

  requireText(report.generation?.provider ?? '', 'generation.provider', issues);
  requireText(report.generation?.model ?? '', 'generation.model', issues);
  requireText(report.generation?.promptVersion ?? '', 'generation.promptVersion', issues);
  if (report.generation?.contractVersion !== SESSION_COMPASS_SCHEMA_VERSION) {
    add(issues, 'INVALID_CONTRACT_VERSION', 'generation.contractVersion', 'Versione contratto non supportata.');
  }
  if (!isIsoTimestamp(report.generation?.generatedAt ?? '')) {
    add(issues, 'INVALID_ISO_TIMESTAMP', 'generation.generatedAt', 'Timestamp ISO 8601 con timezone richiesto.');
  }

  return issues;
}

export function assertValidSessionCompassReport(
  report: SessionCompassReport,
  context: SessionCompassValidationContext
): void {
  const issues = validateSessionCompassReport(report, context);
  if (issues.length) throw new SessionCompassValidationError(issues);
}

function validateEvidence(
  evidence: CompassEvidence | undefined,
  path: string,
  segments: ReadonlyMap<number, CompassSourceSegment>,
  issues: SessionCompassValidationIssue[]
): CompassEvidence | null {
  if (!evidence) {
    add(issues, 'MISSING_EVIDENCE', path, 'Evidenza transcript obbligatoria.');
    return null;
  }
  const segment = segments.get(evidence.transcriptSegmentId);
  if (!segment) {
    add(issues, 'UNKNOWN_TRANSCRIPT_SEGMENT', `${path}.transcriptSegmentId`, 'Il segmento citato non esiste nella sessione.');
    return null;
  }
  if (evidence.startMs !== segment.startMs) {
    add(issues, 'EVIDENCE_TIMESTAMP_MISMATCH', `${path}.startMs`, 'Il timestamp non corrisponde al segmento.');
  }
  if (evidence.minute !== minuteFromMs(segment.startMs)) {
    add(issues, 'EVIDENCE_MINUTE_MISMATCH', `${path}.minute`, 'Il minuto non corrisponde al segmento.');
  }
  if (evidence.speaker !== segment.speaker) {
    add(issues, 'EVIDENCE_SPEAKER_MISMATCH', `${path}.speaker`, 'Lo speaker non corrisponde al segmento.');
  }
  if (!evidence.quote?.trim()) {
    add(issues, 'MISSING_EVIDENCE_QUOTE', `${path}.quote`, 'L’estratto è obbligatorio.');
    return null;
  }
  if (evidence.quote.length > MAX_QUOTE_LENGTH) {
    add(issues, 'EVIDENCE_QUOTE_TOO_LONG', `${path}.quote`, `L’estratto supera ${MAX_QUOTE_LENGTH} caratteri.`);
  }
  if (!containsQuote(segment.text, evidence.quote)) {
    add(issues, 'EVIDENCE_QUOTE_NOT_FOUND', `${path}.quote`, 'L’estratto non compare nel segmento citato.');
  }
  return evidence;
}

function requireText(value: string, path: string, issues: SessionCompassValidationIssue[]): void {
  if (typeof value !== 'string' || !value.trim()) {
    add(issues, 'BLANK_TEXT', path, 'Il valore non può essere vuoto.');
  }
}

function requireProseSafety(value: string, path: string, issues: SessionCompassValidationIssue[]): void {
  if (typeof value === 'string' && containsForbiddenClaim(value)) {
    add(issues, 'FORBIDDEN_CLAIM', path, 'Il testo presenta una causa o una diagnosi come fatto.');
  }
}

function requireId(
  id: string,
  path: string,
  ids: Set<string>,
  issues: SessionCompassValidationIssue[]
): void {
  if (typeof id !== 'string' || !id.trim()) {
    add(issues, 'BLANK_ID', path, 'L’id non può essere vuoto.');
    return;
  }
  if (ids.has(id)) {
    add(issues, 'DUPLICATE_ID', path, 'Gli id devono essere unici nel report.');
    return;
  }
  ids.add(id);
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function isIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function add(
  issues: SessionCompassValidationIssue[],
  code: string,
  path: string,
  message: string
): void {
  issues.push({ code, path, message });
}
