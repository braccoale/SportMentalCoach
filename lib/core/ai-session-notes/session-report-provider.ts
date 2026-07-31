import type { AnnotatedConversationModel } from './conversation-annotation';
import {
  AI_SESSION_REPORT_SCHEMA_VERSION,
  validateAiSessionReport,
  type AiSessionReport,
  type ReportValidationIssue,
} from './session-report-contract';

export type SessionReportGenerationInput = {
  sessionId: string;
  conversation: AnnotatedConversationModel;
  language: string;
  promptVersion: string;
  generatedAt: string;
};

/** A provider-neutral boundary for future report generation implementations. */
export interface SessionReportProvider {
  readonly providerName: string;
  readonly modelName: string;

  generateReport(input: SessionReportGenerationInput): Promise<AiSessionReport>;
}

export type SessionReportGenerationErrorCode =
  | 'PROVIDER_FAILED'
  | 'INVALID_PROVIDER_OUTPUT'
  | 'METADATA_MISMATCH';

/**
 * A deliberately sanitized generation error. It retains validation issues
 * where useful, but never exposes provider payloads or thrown error details.
 */
export class SessionReportGenerationError extends Error {
  constructor(
    public readonly code: SessionReportGenerationErrorCode,
    message: string,
    public readonly validationIssues: readonly ReportValidationIssue[] = [],
    public readonly providerErrorCode?: string
  ) {
    super(message);
    this.name = 'SessionReportGenerationError';
  }
}

/**
 * Calls one injected provider and accepts only contract-valid, context-matched
 * report output. This function performs no I/O and does not mutate its inputs.
 */
export async function generateValidatedSessionReport(
  input: SessionReportGenerationInput,
  provider: SessionReportProvider
): Promise<AiSessionReport> {
  let report: AiSessionReport;
  try {
    report = await provider.generateReport(input);
  } catch (error) {
    const providerErrorCode =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
    throw new SessionReportGenerationError(
      'PROVIDER_FAILED',
      'Session report provider did not complete report generation.',
      [],
      typeof providerErrorCode === 'string' ? providerErrorCode : undefined
    );
  }

  if (!matchesGenerationContext(report, input, provider)) {
    throw new SessionReportGenerationError(
      'METADATA_MISMATCH',
      'Provider report metadata did not match the supplied generation context.'
    );
  }

  const validationIssues = validateAiSessionReport(report, input.conversation);
  if (validationIssues.length) {
    throw new SessionReportGenerationError(
      'INVALID_PROVIDER_OUTPUT',
      'Provider report output did not satisfy the session report contract.',
      validationIssues
    );
  }
  return report;
}

export type FakeSessionReportProviderOptions = {
  report: AiSessionReport;
  providerName?: string;
  modelName?: string;
  rejection?: unknown;
};

/**
 * Deterministic in-memory provider for focused tests. Each invocation returns
 * a deep copy, records its input, and has no database, network, or environment
 * dependency.
 */
export class FakeSessionReportProvider implements SessionReportProvider {
  readonly providerName: string;
  readonly modelName: string;
  invocationCount = 0;
  lastInput: SessionReportGenerationInput | undefined;

  constructor(private readonly options: FakeSessionReportProviderOptions) {
    this.providerName = options.providerName ?? 'fake';
    this.modelName = options.modelName ?? 'fake-report-v1';
  }

  async generateReport(
    input: SessionReportGenerationInput
  ): Promise<AiSessionReport> {
    this.invocationCount += 1;
    this.lastInput = { ...input };
    if (this.options.rejection !== undefined) {
      throw this.options.rejection;
    }
    return structuredClone(this.options.report);
  }
}

function matchesGenerationContext(
  report: AiSessionReport,
  input: SessionReportGenerationInput,
  provider: SessionReportProvider
): boolean {
  return (
    report.schemaVersion === AI_SESSION_REPORT_SCHEMA_VERSION &&
    report.sessionId === input.sessionId &&
    report.conversationId === input.conversation.conversationId &&
    report.language === input.language &&
    report.generation.provider === provider.providerName &&
    report.generation.model === provider.modelName &&
    report.generation.promptVersion === input.promptVersion &&
    report.generation.contractVersion === AI_SESSION_REPORT_SCHEMA_VERSION &&
    report.generation.generatedAt === input.generatedAt
  );
}
