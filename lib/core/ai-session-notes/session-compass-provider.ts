/**
 * Confine provider-neutro per Session Compass v1.
 *
 * Il montaggio del documento avviene qui, non nell'adapter: l'output del
 * modello è trattato come contenuto non fidato e ogni insight privo di
 * evidenza verificabile viene *omesso*, mai completato o inventato.
 */

import {
  SESSION_COMPASS_REPORT_KIND,
  SESSION_COMPASS_SCHEMA_VERSION,
  MAX_KEY_MOMENTS,
  MAX_EMOTIONAL_TREND_POINTS,
  MAX_NEXT_SESSION_PREP,
  MAX_SESSION_METRICS,
  MAX_THEMES,
  KEY_MOMENT_CATEGORIES,
  METRIC_CONFIDENCE_LEVELS,
  SESSION_METRIC_KEYS,
  containsForbiddenClaim,
  indexSourceSegments,
  resolveEvidence,
  validateSessionCompassReport,
  type Commitment,
  type CompassEvidence,
  type CompassSourceSegment,
  type CompassSpeaker,
  type EmotionalTrendPoint,
  type KeyMoment,
  type KeyMomentCategory,
  type MetricConfidence,
  type NextSessionPrepItem,
  type NextSessionPrepOrigin,
  type SessionCompassReport,
  type SessionMetric,
  type SessionMetricKey,
  type SessionCompassValidationIssue,
  type CompassTheme,
} from './session-compass-contract';

/** Contesto lecito e già disponibile. Nessuno storico grezzo delle sessioni. */
export type SessionCompassPreviousReport = {
  version: number;
  approvedAt: string;
  summary: string;
  themes: string[];
  openCommitments: Array<{ text: string; owner: CompassSpeaker; status: string }>;
};

export type SessionCompassContext = {
  coachName: string;
  coachRole: string;
  athleteSport: string | null;
  pathGoal: string | null;
  /** Al massimo gli ultimi due report approvati dal coach. */
  previousApprovedReports: SessionCompassPreviousReport[];
};

export type SessionCompassGenerationInput = {
  sessionId: string;
  language: string;
  promptVersion: string;
  generatedAt: string;
  sourceFingerprint: string;
  segments: CompassSourceSegment[];
  context: SessionCompassContext;
};

export interface SessionCompassReportProvider {
  readonly providerName: string;
  readonly modelName: string;

  generateReport(
    input: SessionCompassGenerationInput
  ): Promise<SessionCompassReport>;
}

export type SessionCompassGenerationErrorCode =
  | 'PROVIDER_FAILED'
  | 'INVALID_PROVIDER_OUTPUT'
  | 'METADATA_MISMATCH';

export class SessionCompassGenerationError extends Error {
  constructor(
    public readonly code: SessionCompassGenerationErrorCode,
    message: string,
    public readonly validationIssues: readonly SessionCompassValidationIssue[] = [],
    public readonly providerErrorCode?: string
  ) {
    super(message);
    this.name = 'SessionCompassGenerationError';
  }
}

/** Contenuto grezzo atteso dal modello, prima di qualsiasi verifica. */
export type RawCompassContent = {
  sessionOverview?: {
    summary?: unknown;
    summaryEvidence?: unknown;
    themes?: unknown;
    emergingResource?: unknown;
    metrics?: unknown;
    emotionalTrend?: unknown;
  };
  keyMoments?: unknown;
  commitments?: unknown;
  nextSessionPrep?: unknown;
};

/**
 * Costruisce il documento finale dal contenuto grezzo. Gli elementi non
 * supportati da un'evidenza risolvibile, o con linguaggio causale/clinico,
 * vengono scartati; i limiti di cardinalità sono applicati per troncamento.
 */
export function assembleSessionCompassReport(
  content: RawCompassContent,
  input: SessionCompassGenerationInput,
  provider: { providerName: string; modelName: string }
): SessionCompassReport {
  const segments = indexSourceSegments(input.segments);
  const overview = asRecord(content.sessionOverview) ?? {};
  const summary = asProse(overview.summary);
  const summaryEvidence = asArray(overview.summaryEvidence)
    .map((item) => evidenceOf(item, segments))
    .filter(isEvidence);

  const themes: CompassTheme[] = withIdentifiers(
    'theme',
    asArray(overview.themes).flatMap((item) => {
      const record = asRecord(item);
      const text = asProse(record?.text);
      const evidence = evidenceOf(record?.evidence, segments);
      if (!record || !text || !evidence) return [];
      return [{ text, evidence }];
    })
  ).slice(0, MAX_THEMES);

  const resourceRecord = asRecord(overview.emergingResource);
  const resourceText = asProse(resourceRecord?.text);
  const resourceEvidence = evidenceOf(resourceRecord?.evidence, segments);
  const emergingResource =
    resourceRecord && resourceText && resourceEvidence
      ? { id: 'resource-1', text: resourceText, evidence: resourceEvidence }
      : null;

  const seenMetricKeys = new Set<SessionMetricKey>();
  const metrics: SessionMetric[] = withIdentifiers(
    'metric',
    asArray(overview.metrics).flatMap((item) => {
      const record = asRecord(item);
      const key = asMetricKey(record?.key);
      const value = asIntegerInRange(record?.value, 1, 5);
      const confidence = asMetricConfidence(record?.confidence);
      const evidence = evidenceOf(record?.evidence, segments);
      if (!record || !key || value === null || !confidence || !evidence || seenMetricKeys.has(key)) return [];
      seenMetricKeys.add(key);
      return [{ key, value, confidence, evidence }];
    })
  ).slice(0, MAX_SESSION_METRICS);

  const emotionalTrend: EmotionalTrendPoint[] = withIdentifiers(
    'emotion',
    asArray(overview.emotionalTrend).flatMap((item) => {
      const record = asRecord(item);
      const value = asIntegerInRange(record?.value, -2, 2);
      const label = asProse(record?.label);
      const evidence = evidenceOf(record?.evidence, segments);
      if (!record || value === null || !label || !evidence) return [];
      return [{ value, label, evidence }];
    })
  )
    .sort((left, right) => left.evidence.startMs - right.evidence.startMs)
    .slice(0, MAX_EMOTIONAL_TREND_POINTS);

  const keyMoments: KeyMoment[] = withIdentifiers(
    'moment',
    asArray(content.keyMoments).flatMap((item) => {
      const record = asRecord(item);
      const title = asProse(record?.title);
      const explanation = asProse(record?.explanation);
      const evidence = evidenceOf(record?.evidence, segments);
      if (!record || !title || !explanation || !evidence) return [];
      const speaker = asSpeaker(record.speaker) ?? evidence.speaker;
      if (speaker !== evidence.speaker) return [];
      return [{
        title,
        explanation,
        speaker,
        evidence,
        category: asMomentCategory(record.category) ?? undefined,
        theme: asNullableProse(record.theme),
        relevance: asMomentRelevance(record.relevance) ?? undefined,
      }];
    })
  ).slice(0, MAX_KEY_MOMENTS);

  const commitments: Commitment[] = withIdentifiers(
    'commitment',
    asArray(content.commitments).flatMap((item) => {
      const record = asRecord(item);
      const text = asProse(record?.text);
      const owner = asSpeaker(record?.owner);
      const evidence = evidenceOf(record?.evidence, segments);
      if (!record || !text || !owner || !evidence) return [];
      return [
        {
          text,
          owner,
          status: 'pending' as const,
          dueDate: asCalendarDate(record.dueDate),
          evidence,
        },
      ];
    })
  );

  const nextSessionPrep: NextSessionPrepItem[] = withIdentifiers(
    'prep',
    asArray(content.nextSessionPrep).flatMap((item) => {
      const record = asRecord(item);
      const text = asProse(record?.text);
      const evidence = evidenceOf(record?.evidence, segments);
      const origin = asOrigin(record?.origin);
      if (!record || !text || !evidence || !origin) return [];
      return [{ text, origin, evidence }];
    })
  ).slice(0, MAX_NEXT_SESSION_PREP);

  return {
    schemaVersion: SESSION_COMPASS_SCHEMA_VERSION,
    reportKind: SESSION_COMPASS_REPORT_KIND,
    sessionId: input.sessionId,
    sourceFingerprint: input.sourceFingerprint,
    language: input.language,
    sessionOverview: { summary, summaryEvidence, themes, emergingResource, metrics, emotionalTrend },
    keyMoments,
    commitments,
    nextSessionPrep,
    coachNote: null,
    generation: {
      provider: provider.providerName,
      model: provider.modelName,
      promptVersion: input.promptVersion,
      contractVersion: SESSION_COMPASS_SCHEMA_VERSION,
      generatedAt: input.generatedAt,
    },
  };
}

/**
 * Invoca un provider iniettato e accetta solo output conforme al contratto e
 * coerente con il contesto di generazione. Non esegue I/O proprio.
 */
export async function generateValidatedSessionCompassReport(
  input: SessionCompassGenerationInput,
  provider: SessionCompassReportProvider
): Promise<SessionCompassReport> {
  let report: SessionCompassReport;
  try {
    report = await provider.generateReport(input);
  } catch (error) {
    const providerErrorCode =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
    throw new SessionCompassGenerationError(
      'PROVIDER_FAILED',
      'Il provider Session Compass non ha completato la generazione.',
      [],
      typeof providerErrorCode === 'string' ? providerErrorCode : undefined
    );
  }

  if (!matchesGenerationContext(report, input, provider)) {
    throw new SessionCompassGenerationError(
      'METADATA_MISMATCH',
      'I metadati del report non corrispondono al contesto di generazione.'
    );
  }

  const issues = validateSessionCompassReport(report, {
    sessionId: input.sessionId,
    sourceFingerprint: input.sourceFingerprint,
    segments: input.segments,
  });
  if (issues.length) {
    throw new SessionCompassGenerationError(
      'INVALID_PROVIDER_OUTPUT',
      'L’output del provider non rispetta il contratto Session Compass.',
      issues
    );
  }
  return report;
}

export type FakeSessionCompassProviderOptions = {
  content?: RawCompassContent;
  report?: SessionCompassReport;
  providerName?: string;
  modelName?: string;
  rejection?: unknown;
};

/** Provider deterministico in memoria per i test: nessuna rete, nessun env. */
export class FakeSessionCompassReportProvider
  implements SessionCompassReportProvider
{
  readonly providerName: string;
  readonly modelName: string;
  invocationCount = 0;
  lastInput: SessionCompassGenerationInput | undefined;

  constructor(private readonly options: FakeSessionCompassProviderOptions) {
    this.providerName = options.providerName ?? 'fake';
    this.modelName = options.modelName ?? 'fake-compass-v1';
  }

  async generateReport(
    input: SessionCompassGenerationInput
  ): Promise<SessionCompassReport> {
    this.invocationCount += 1;
    this.lastInput = { ...input };
    if (this.options.rejection !== undefined) throw this.options.rejection;
    if (this.options.report) return structuredClone(this.options.report);
    return assembleSessionCompassReport(this.options.content ?? {}, input, this);
  }
}

function matchesGenerationContext(
  report: SessionCompassReport,
  input: SessionCompassGenerationInput,
  provider: SessionCompassReportProvider
): boolean {
  return (
    report.schemaVersion === SESSION_COMPASS_SCHEMA_VERSION &&
    report.reportKind === SESSION_COMPASS_REPORT_KIND &&
    report.sessionId === input.sessionId &&
    report.sourceFingerprint === input.sourceFingerprint &&
    report.language === input.language &&
    report.generation.provider === provider.providerName &&
    report.generation.model === provider.modelName &&
    report.generation.promptVersion === input.promptVersion &&
    report.generation.contractVersion === SESSION_COMPASS_SCHEMA_VERSION &&
    report.generation.generatedAt === input.generatedAt
  );
}

function evidenceOf(
  value: unknown,
  segments: ReadonlyMap<number, CompassSourceSegment>
): CompassEvidence | null {
  const record = asRecord(value);
  if (!record) return null;
  return resolveEvidence(
    {
      transcriptSegmentId: record.transcriptSegmentId,
      quote: record.quote,
    },
    segments
  );
}

function isEvidence(value: CompassEvidence | null): value is CompassEvidence {
  return value !== null;
}

/** Testo accettabile solo se non presenta cause o diagnosi come fatto. */
function asProse(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || containsForbiddenClaim(text)) return '';
  return text;
}

function asSpeaker(value: unknown): CompassSpeaker | null {
  return value === 'coach' || value === 'athlete' ? value : null;
}

function asOrigin(value: unknown): NextSessionPrepOrigin | null {
  return value === 'theme' || value === 'commitment' || value === 'open_question'
    ? value
    : null;
}

function asMetricKey(value: unknown): SessionMetricKey | null {
  return typeof value === 'string' && SESSION_METRIC_KEYS.includes(value as SessionMetricKey)
    ? (value as SessionMetricKey)
    : null;
}

function asMetricConfidence(value: unknown): MetricConfidence | null {
  return typeof value === 'string' && METRIC_CONFIDENCE_LEVELS.includes(value as MetricConfidence)
    ? (value as MetricConfidence)
    : null;
}

function asMomentCategory(value: unknown): KeyMomentCategory | null {
  return typeof value === 'string' && KEY_MOMENT_CATEGORIES.includes(value as KeyMomentCategory)
    ? (value as KeyMomentCategory)
    : null;
}

function asMomentRelevance(value: unknown): 1 | 2 | 3 | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

function asIntegerInRange(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function asNullableProse(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return asProse(value) || null;
}

function asCalendarDate(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

/**
 * Gli id sono assegnati da noi e non dal modello: restano unici nel documento
 * e deterministici, così due generazioni sullo stesso input coincidono.
 */
function withIdentifiers<T>(prefix: string, items: readonly T[]): Array<T & { id: string }> {
  return items.map((item, index) => ({ ...item, id: `${prefix}-${index + 1}` }));
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
