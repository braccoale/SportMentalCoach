import {
  ACADEMY_RECAP_SCHEMA_VERSION,
  validateAcademyRecapContent,
  type AcademyRecapContent,
  type RecapValidationIssue,
} from './contract';

export type AcademyRecapGenerationInput = {
  sessionId: number;
  courseTitle: string;
  moduleTitle: string;
  transcriptText: string;
  generatedAt: string;
};

/** Confine provider-neutro, stesso ruolo di `SessionReportProvider` per il report AI Notes. */
export interface AcademyRecapProvider {
  readonly providerName: string;
  readonly modelName: string;
  generateRecap(input: AcademyRecapGenerationInput): Promise<AcademyRecapContent>;
}

export type AcademyRecapGenerationErrorCode = 'PROVIDER_FAILED' | 'INVALID_PROVIDER_OUTPUT';

export class AcademyRecapGenerationError extends Error {
  constructor(
    public readonly code: AcademyRecapGenerationErrorCode,
    message: string,
    public readonly validationIssues: readonly RecapValidationIssue[] = []
  ) {
    super(message);
    this.name = 'AcademyRecapGenerationError';
  }
}

/**
 * Chiama un provider iniettato e accetta solo un output conforme al
 * contratto. Nessuna I/O propria — pura, testabile senza chiamare OpenAI.
 */
export async function generateValidatedAcademyRecap(
  input: AcademyRecapGenerationInput,
  provider: AcademyRecapProvider
): Promise<AcademyRecapContent> {
  let content: AcademyRecapContent;
  try {
    content = await provider.generateRecap(input);
  } catch (error) {
    if (error instanceof AcademyRecapGenerationError) throw error;
    throw new AcademyRecapGenerationError(
      'PROVIDER_FAILED',
      'Il provider non ha completato la generazione del recap.'
    );
  }

  const issues = validateAcademyRecapContent(content);
  if (issues.length > 0) {
    throw new AcademyRecapGenerationError(
      'INVALID_PROVIDER_OUTPUT',
      'Il recap generato non rispetta il contratto atteso.',
      issues
    );
  }
  if (content.schemaVersion !== ACADEMY_RECAP_SCHEMA_VERSION) {
    throw new AcademyRecapGenerationError(
      'INVALID_PROVIDER_OUTPUT',
      'Versione dello schema del recap inattesa.'
    );
  }
  return content;
}
