import type { AnnotatedConversationModel } from './conversation-annotation';

export const AI_SESSION_REPORT_SCHEMA_VERSION = '1.0' as const;

export type EvidenceBackedText = {
  text: string;
  sourceTurnIndexes: number[];
};

export type EvidenceBackedItem = EvidenceBackedText & {
  id: string;
  confidence?: number;
};

/**
 * Suggested items are proposals for a future session, not factual claims.
 * They may therefore omit source evidence, unlike evidence-backed content.
 */
export type SuggestedItem = {
  id: string;
  text: string;
  rationale?: string;
  sourceTurnIndexes?: number[];
};

export type SafetyFlagCategory =
  | 'self_harm'
  | 'harm_to_others'
  | 'abuse'
  | 'medical'
  | 'psychological_crisis'
  | 'other';

export type SafetyFlagSeverity = 'low' | 'medium' | 'high';

/**
 * A draft signal requiring qualified human review. It is not a diagnosis,
 * treatment recommendation, or automatic safety determination.
 */
export type SafetyFlag = {
  id: string;
  category: SafetyFlagCategory;
  severity: SafetyFlagSeverity;
  description: string;
  sourceTurnIndexes: number[];
  requiresHumanReview: true;
};

export type ReportGenerationMetadata = {
  provider: string;
  model: string;
  promptVersion: string;
  contractVersion: string;
  generatedAt: string;
};

/**
 * Provider-neutral draft report contract.
 *
 * `athleteStatements` records only claims explicitly made by the athlete.
 * `coachObservations` contains proposed interpretations for coach review, not
 * established facts. `goals` and `exercisesOrHomework` contain only content
 * explicitly mentioned, agreed, discussed, or assigned in the conversation.
 */
export type AiSessionReport = {
  schemaVersion: typeof AI_SESSION_REPORT_SCHEMA_VERSION;
  reportId: string;
  sessionId: string;
  conversationId: string;
  language: string;
  status: 'draft';
  summary: EvidenceBackedText;
  themes: EvidenceBackedItem[];
  athleteStatements: EvidenceBackedItem[];
  coachObservations: EvidenceBackedItem[];
  goals: EvidenceBackedItem[];
  exercisesOrHomework: EvidenceBackedItem[];
  followUpQuestions: SuggestedItem[];
  safetyFlags: SafetyFlag[];
  generation: ReportGenerationMetadata;
  createdAt: string;
};

export type ReportValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export class AiSessionReportValidationError extends Error {
  readonly issues: readonly ReportValidationIssue[];

  constructor(issues: readonly ReportValidationIssue[]) {
    super('INVALID_AI_SESSION_REPORT');
    this.name = 'AiSessionReportValidationError';
    this.issues = issues;
  }
}

/**
 * Validates structure and turn evidence only. It intentionally makes no
 * semantic judgement about the report text and does not mutate either input.
 */
export function validateAiSessionReport(
  report: AiSessionReport,
  conversation: AnnotatedConversationModel
): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  const conversationTurnIndexes = new Set(
    conversation.turns.map((turn) => turn.turnIndex)
  );
  const itemIds = new Set<string>();

  if (report.schemaVersion !== AI_SESSION_REPORT_SCHEMA_VERSION) {
    addIssue(
      issues,
      'UNSUPPORTED_SCHEMA_VERSION',
      'schemaVersion',
      `Expected schema version ${AI_SESSION_REPORT_SCHEMA_VERSION}.`
    );
  }
  validateNonBlank(report.reportId, 'reportId', issues);
  validateNonBlank(report.sessionId, 'sessionId', issues);
  validateNonBlank(report.conversationId, 'conversationId', issues);
  validateNonBlank(report.language, 'language', issues);
  if (report.status !== 'draft') {
    addIssue(issues, 'INVALID_REPORT_STATUS', 'status', 'Status must be draft.');
  }
  if (report.sessionId !== String(conversation.sessionId)) {
    addIssue(
      issues,
      'SESSION_REFERENCE_MISMATCH',
      'sessionId',
      'Report sessionId must match the supplied conversation.'
    );
  }
  if (report.conversationId !== conversation.conversationId) {
    addIssue(
      issues,
      'CONVERSATION_REFERENCE_MISMATCH',
      'conversationId',
      'Report conversationId must match the supplied conversation.'
    );
  }

  validateEvidenceBackedText(
    report.summary,
    'summary',
    conversationTurnIndexes,
    issues
  );
  validateEvidenceBackedItems(report.themes, 'themes', conversationTurnIndexes, itemIds, issues);
  validateEvidenceBackedItems(
    report.athleteStatements,
    'athleteStatements',
    conversationTurnIndexes,
    itemIds,
    issues
  );
  validateEvidenceBackedItems(
    report.coachObservations,
    'coachObservations',
    conversationTurnIndexes,
    itemIds,
    issues
  );
  validateEvidenceBackedItems(report.goals, 'goals', conversationTurnIndexes, itemIds, issues);
  validateEvidenceBackedItems(
    report.exercisesOrHomework,
    'exercisesOrHomework',
    conversationTurnIndexes,
    itemIds,
    issues
  );
  validateSuggestedItems(report.followUpQuestions, conversationTurnIndexes, itemIds, issues);
  validateSafetyFlags(report.safetyFlags, conversationTurnIndexes, itemIds, issues);
  validateGenerationMetadata(report.generation, issues);
  validateTimestamp(report.createdAt, 'createdAt', issues);

  return issues;
}

export function assertValidAiSessionReport(
  report: AiSessionReport,
  conversation: AnnotatedConversationModel
): void {
  const issues = validateAiSessionReport(report, conversation);
  if (issues.length) {
    throw new AiSessionReportValidationError(issues);
  }
}

/** Returns all supplied report evidence indexes as unique ascending values. */
export function collectReportEvidenceIndexes(report: AiSessionReport): number[] {
  const indexes = [
    ...report.summary.sourceTurnIndexes,
    ...evidenceIndexesForItems(report.themes),
    ...evidenceIndexesForItems(report.athleteStatements),
    ...evidenceIndexesForItems(report.coachObservations),
    ...evidenceIndexesForItems(report.goals),
    ...evidenceIndexesForItems(report.exercisesOrHomework),
    ...report.followUpQuestions.flatMap((item) => item.sourceTurnIndexes ?? []),
    ...report.safetyFlags.flatMap((flag) => flag.sourceTurnIndexes),
  ];
  return [...new Set(indexes)].sort((left, right) => left - right);
}

function validateEvidenceBackedItems(
  items: readonly EvidenceBackedItem[],
  path: string,
  conversationTurnIndexes: ReadonlySet<number>,
  itemIds: Set<string>,
  issues: ReportValidationIssue[]
): void {
  for (const [index, item] of items.entries()) {
    const itemPath = `${path}[${index}]`;
    validateItemId(item.id, `${itemPath}.id`, itemIds, issues);
    validateEvidenceBackedText(item, itemPath, conversationTurnIndexes, issues);
    if (
      item.confidence !== undefined &&
      (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1)
    ) {
      addIssue(
        issues,
        'INVALID_CONFIDENCE',
        `${itemPath}.confidence`,
        'Confidence must be a finite number between 0 and 1.'
      );
    }
  }
}

function validateEvidenceBackedText(
  value: EvidenceBackedText,
  path: string,
  conversationTurnIndexes: ReadonlySet<number>,
  issues: ReportValidationIssue[]
): void {
  validateNonBlank(value.text, `${path}.text`, issues);
  validateEvidenceIndexes(
    value.sourceTurnIndexes,
    `${path}.sourceTurnIndexes`,
    conversationTurnIndexes,
    true,
    issues
  );
}

function validateSuggestedItems(
  items: readonly SuggestedItem[],
  conversationTurnIndexes: ReadonlySet<number>,
  itemIds: Set<string>,
  issues: ReportValidationIssue[]
): void {
  for (const [index, item] of items.entries()) {
    const path = `followUpQuestions[${index}]`;
    validateItemId(item.id, `${path}.id`, itemIds, issues);
    validateNonBlank(item.text, `${path}.text`, issues);
    if (item.rationale !== undefined) {
      validateNonBlank(item.rationale, `${path}.rationale`, issues);
    }
    if (item.sourceTurnIndexes !== undefined) {
      validateEvidenceIndexes(
        item.sourceTurnIndexes,
        `${path}.sourceTurnIndexes`,
        conversationTurnIndexes,
        false,
        issues
      );
    }
  }
}

function validateSafetyFlags(
  flags: readonly SafetyFlag[],
  conversationTurnIndexes: ReadonlySet<number>,
  itemIds: Set<string>,
  issues: ReportValidationIssue[]
): void {
  for (const [index, flag] of flags.entries()) {
    const path = `safetyFlags[${index}]`;
    validateItemId(flag.id, `${path}.id`, itemIds, issues);
    if (!isSafetyFlagCategory(flag.category)) {
      addIssue(
        issues,
        'INVALID_SAFETY_FLAG_CATEGORY',
        `${path}.category`,
        'Safety flag category is not supported.'
      );
    }
    if (!isSafetyFlagSeverity(flag.severity)) {
      addIssue(
        issues,
        'INVALID_SAFETY_FLAG_SEVERITY',
        `${path}.severity`,
        'Safety flag severity is not supported.'
      );
    }
    validateNonBlank(flag.description, `${path}.description`, issues);
    if (flag.requiresHumanReview !== true) {
      addIssue(
        issues,
        'INVALID_SAFETY_FLAG_REVIEW_REQUIREMENT',
        `${path}.requiresHumanReview`,
        'Safety flags must always require human review.'
      );
    }
    validateEvidenceIndexes(
      flag.sourceTurnIndexes,
      `${path}.sourceTurnIndexes`,
      conversationTurnIndexes,
      true,
      issues
    );
  }
}

function validateEvidenceIndexes(
  indexes: readonly number[],
  path: string,
  conversationTurnIndexes: ReadonlySet<number>,
  required: boolean,
  issues: ReportValidationIssue[]
): void {
  if (required && !indexes.length) {
    addIssue(issues, 'MISSING_EVIDENCE', path, 'At least one source turn is required.');
    return;
  }
  const seen = new Set<number>();
  for (const [index, turnIndex] of indexes.entries()) {
    const indexPath = `${path}[${index}]`;
    if (!Number.isInteger(turnIndex) || turnIndex < 0) {
      addIssue(
        issues,
        'INVALID_SOURCE_TURN_INDEX',
        indexPath,
        'Source turn indexes must be non-negative integers.'
      );
      continue;
    }
    if (seen.has(turnIndex)) {
      addIssue(
        issues,
        'DUPLICATE_SOURCE_TURN_INDEX',
        indexPath,
        'Source turn indexes must be unique within an item.'
      );
    }
    seen.add(turnIndex);
    if (!conversationTurnIndexes.has(turnIndex)) {
      addIssue(
        issues,
        'UNKNOWN_SOURCE_TURN_INDEX',
        indexPath,
        'Source turn index does not exist in the supplied conversation.'
      );
    }
  }
}

function validateItemId(
  id: string,
  path: string,
  itemIds: Set<string>,
  issues: ReportValidationIssue[]
): void {
  if (!id.trim()) {
    addIssue(issues, 'BLANK_ID', path, 'Item id must not be blank.');
    return;
  }
  if (itemIds.has(id)) {
    addIssue(issues, 'DUPLICATE_ITEM_ID', path, 'Item ids must be unique within a report.');
    return;
  }
  itemIds.add(id);
}

function validateGenerationMetadata(
  generation: ReportGenerationMetadata,
  issues: ReportValidationIssue[]
): void {
  validateNonBlank(generation.provider, 'generation.provider', issues);
  validateNonBlank(generation.model, 'generation.model', issues);
  validateNonBlank(generation.promptVersion, 'generation.promptVersion', issues);
  validateNonBlank(generation.contractVersion, 'generation.contractVersion', issues);
  validateTimestamp(generation.generatedAt, 'generation.generatedAt', issues);
}

function validateNonBlank(
  value: string,
  path: string,
  issues: ReportValidationIssue[]
): void {
  if (!value.trim()) {
    addIssue(issues, 'BLANK_TEXT', path, 'Value must not be blank.');
  }
}

function validateTimestamp(
  value: string,
  path: string,
  issues: ReportValidationIssue[]
): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(
    value
  );
  const valid =
    match !== null &&
    validIsoDateTimeParts(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
      match[7] === undefined ? 0 : Number(match[7]),
      match[8] === undefined ? 0 : Number(match[8])
    );
  if (!valid) {
    addIssue(
      issues,
      'INVALID_ISO_TIMESTAMP',
      path,
      'Timestamp must be a valid ISO 8601 date-time with a timezone.'
    );
  }
}

function validIsoDateTimeParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  offsetHour: number,
  offsetMinute: number
): boolean {
  return (
    year >= 0 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isSafetyFlagCategory(value: string): value is SafetyFlagCategory {
  return [
    'self_harm',
    'harm_to_others',
    'abuse',
    'medical',
    'psychological_crisis',
    'other',
  ].includes(value);
}

function isSafetyFlagSeverity(value: string): value is SafetyFlagSeverity {
  return ['low', 'medium', 'high'].includes(value);
}

function evidenceIndexesForItems(items: readonly EvidenceBackedItem[]): number[] {
  return items.flatMap((item) => item.sourceTurnIndexes);
}

function addIssue(
  issues: ReportValidationIssue[],
  code: string,
  path: string,
  message: string
): void {
  issues.push({ code, path, message });
}
