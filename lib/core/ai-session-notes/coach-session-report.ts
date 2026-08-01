import { annotateConversation } from './conversation-annotation';
import { conversationFromTranscript } from './conversation-model';
import {
  generateValidatedSessionReport,
  type SessionReportProvider,
} from './session-report-provider';
import { normalizeTranscript } from './transcript-normalization';
import type { AiSessionReport } from './session-report-contract';

export type CoachReportTranscriptSource = {
  participantId: number | null;
  speakerRole: string;
  sequenceNumber: number;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
  provider: string | null;
  model: string | null;
};

export type CoachReportSessionSource = {
  id: number;
  coachUserId: number;
  status: string;
  language: string;
  transcript: CoachReportTranscriptSource[];
};

export type CoachReportTranscriptTurn = {
  turnIndex: number;
  speakerLabel: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type CoachSessionReportDependencies = {
  loadSession: (sessionId: number) => Promise<CoachReportSessionSource | null>;
  hasFeatureAccess: (actorUserId: number) => Promise<boolean>;
  createProvider: () => SessionReportProvider;
  promptVersion: string;
  now: () => Date;
};

export type CoachSessionReportErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FEATURE_NOT_ENABLED'
  | 'SESSION_NOT_ELIGIBLE'
  | 'TRANSCRIPT_UNAVAILABLE'
  | 'REPORT_GENERATION_UNAVAILABLE'
  | 'REPORT_TIMEOUT'
  | 'REPORT_AUTHENTICATION'
  | 'REPORT_RATE_LIMITED'
  | 'REPORT_MALFORMED'
  | 'REPORT_INVALID'
  | 'REPORT_GENERATION_FAILED';

export class CoachSessionReportError extends Error {
  constructor(
    public readonly code: CoachSessionReportErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'CoachSessionReportError';
  }
}

/** Loads a coach-authorized, normalized transcript view without provider I/O. */
export async function getCoachSessionTranscript(
  params: { sessionId: number; actorUserId: number },
  dependencies: CoachSessionReportDependencies
): Promise<CoachReportTranscriptTurn[]> {
  const source = await authorizedEligibleSource(params, dependencies);
  return buildAnnotatedConversation(source, dependencies.now()).turns.map((turn) => ({
    turnIndex: turn.turnIndex,
    speakerLabel: turn.speakerName,
    startMs: turn.startMs,
    endMs: turn.endMs,
    text: turn.text,
  }));
}

/** Generates one in-memory, validated draft report for the current request. */
export async function generateCoachSessionReport(
  params: { sessionId: number; actorUserId: number },
  dependencies: CoachSessionReportDependencies
): Promise<AiSessionReport> {
  const source = await authorizedEligibleSource(params, dependencies);
  if (!dependencies.promptVersion.trim()) {
    throw new CoachSessionReportError(
      'REPORT_GENERATION_UNAVAILABLE',
      'La configurazione del report AI non è disponibile.'
    );
  }
  const generatedAt = dependencies.now().toISOString();
  const conversation = buildAnnotatedConversation(source, new Date(generatedAt));
  let provider: SessionReportProvider;
  try {
    provider = dependencies.createProvider();
  } catch {
    throw new CoachSessionReportError(
      'REPORT_GENERATION_UNAVAILABLE',
      'La configurazione del report AI non è disponibile.'
    );
  }
  try {
    return await generateValidatedSessionReport(
      {
        sessionId: String(source.id),
        conversation,
        language: source.language,
        promptVersion: dependencies.promptVersion,
        generatedAt,
      },
      provider
    );
  } catch (error) {
    throw reportGenerationError(error);
  }
}

function authorizedEligibleSource(
  params: { sessionId: number; actorUserId: number },
  dependencies: CoachSessionReportDependencies
): Promise<CoachReportSessionSource> {
  return dependencies.hasFeatureAccess(params.actorUserId).then(async (hasFeatureAccess) => {
    if (!hasFeatureAccess) {
      throw new CoachSessionReportError(
        'FEATURE_NOT_ENABLED',
        'Appunti AI non è abilitato per questo account.'
      );
    }
    const source = await dependencies.loadSession(params.sessionId);
    if (!source) {
      throw new CoachSessionReportError(
        'SESSION_NOT_FOUND',
        'Sessione Appunti AI non trovata.'
      );
    }
    if (source.coachUserId !== params.actorUserId) {
      throw new CoachSessionReportError(
        'UNAUTHORIZED',
        'Non sei autorizzato a generare il report di questa sessione.'
      );
    }
    if (!['ready_for_review', 'approved'].includes(source.status)) {
      throw new CoachSessionReportError(
        'SESSION_NOT_ELIGIBLE',
        'Il report AI è disponibile quando la trascrizione è pronta.'
      );
    }
    if (!source.transcript.length) {
      throw new CoachSessionReportError(
        'TRANSCRIPT_UNAVAILABLE',
        'La trascrizione della sessione non è ancora disponibile.'
      );
    }
    return source;
  });
}

function buildAnnotatedConversation(
  source: CoachReportSessionSource,
  createdAt: Date
) {
  const transcript = normalizeTranscript({
    provider: source.transcript[0]?.provider ?? 'stored-transcript',
    model: source.transcript[0]?.model ?? 'stored-transcript',
    language: source.language,
    createdAt,
    participants: participantsFor(source.transcript),
    segments: source.transcript
      .slice()
      .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
      .map((segment) => ({
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
        confidence: segment.confidence ?? undefined,
        participantId: segment.participantId,
        speakerRole: segment.speakerRole,
      })),
  });
  return annotateConversation(
    conversationFromTranscript({
      conversationId: `ai-session-${source.id}`,
      sessionId: String(source.id),
      transcript,
    })
  );
}

function participantsFor(transcript: readonly CoachReportTranscriptSource[]) {
  const participants = new Map<string, { id: number; role: string; label: string }>();
  for (const segment of transcript) {
    if (
      segment.participantId === null ||
      !['coach', 'athlete'].includes(segment.speakerRole)
    ) {
      throw new CoachSessionReportError(
        'TRANSCRIPT_UNAVAILABLE',
        'La trascrizione della sessione non è disponibile.'
      );
    }
    const existing = participants.get(String(segment.participantId));
    if (existing && existing.role !== segment.speakerRole) {
      throw new CoachSessionReportError(
        'TRANSCRIPT_UNAVAILABLE',
        'La trascrizione della sessione non è disponibile.'
      );
    }
    participants.set(String(segment.participantId), {
      id: segment.participantId,
      role: segment.speakerRole,
      label: segment.speakerRole === 'coach' ? 'Coach' : 'Atleta',
    });
  }
  return [...participants.values()];
}

function reportGenerationError(error: unknown): CoachSessionReportError {
  const providerCode =
    error && typeof error === 'object' && 'providerErrorCode' in error
      ? (error as { providerErrorCode?: unknown }).providerErrorCode
      : undefined;
  if (providerCode === 'TIMEOUT') {
    return new CoachSessionReportError('REPORT_TIMEOUT', 'Il report AI ha impiegato troppo tempo. Riprova.');
  }
  if (providerCode === 'AUTHENTICATION_FAILED' || providerCode === 'CONFIGURATION') {
    return new CoachSessionReportError('REPORT_AUTHENTICATION', 'La configurazione del report AI non è disponibile.');
  }
  if (providerCode === 'RATE_LIMITED') {
    return new CoachSessionReportError('REPORT_RATE_LIMITED', 'Il servizio AI è temporaneamente occupato. Riprova tra poco.');
  }
  if (providerCode === 'MALFORMED_OUTPUT') {
    return new CoachSessionReportError('REPORT_MALFORMED', 'Il report AI non è stato restituito in un formato valido. Riprova.');
  }
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'INVALID_PROVIDER_OUTPUT'
  ) {
    return new CoachSessionReportError('REPORT_INVALID', 'Il report AI non ha superato i controlli di verifica. Riprova.');
  }
  return new CoachSessionReportError(
    'REPORT_GENERATION_FAILED',
    'Non è stato possibile generare il report AI. Riprova.'
  );
}
