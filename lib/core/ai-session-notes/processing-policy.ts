import type {
  AiProcessingJobStatus,
  AiProcessingJobType,
} from '@/lib/db/schema';

export class AiNotesProcessingError extends Error {
  constructor(
    public readonly code:
      | 'PROVIDER_NOT_CONFIGURED'
      | 'SESSION_NOT_PROCESSABLE'
      | 'PARTICIPANT_RECORDING_NOT_FOUND'
      | 'INVALID_JOB'
      | 'JOB_NOT_FOUND'
      | 'AUDIO_NOT_FOUND'
      | 'AUDIO_INTEGRITY_FAILED'
      | 'UNSUPPORTED_AUDIO'
      | 'CONSENT_INVALID'
      | 'SESSION_CANCELLED'
      | 'PROVIDER_AUTH_FAILED'
      | 'PROVIDER_RATE_LIMITED'
      | 'PROVIDER_TIMEOUT'
      | 'PROVIDER_BAD_RESPONSE'
      | 'TRANSCRIPTION_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'AiNotesProcessingError';
  }
}

export function jobRequiresParticipantRecording(
  jobType: AiProcessingJobType
): boolean {
  return jobType === 'transcription';
}

export function retryStatus(params: {
  attemptCount: number;
  maxAttempts: number;
}): Extract<AiProcessingJobStatus, 'queued' | 'failed'> {
  return params.attemptCount >= params.maxAttempts ? 'failed' : 'queued';
}

export function retryDelayMs(attemptCount: number): number {
  return Math.min(15 * 60_000, Math.max(1, attemptCount) * 60_000);
}

export function sessionCanProcess(params: {
  sessionStatus: string;
  consentStatuses: string[];
}): boolean {
  return (
    !['cancelled', 'consent_rejected'].includes(params.sessionStatus) &&
    params.consentStatuses.length === 2 &&
    params.consentStatuses.every((status) => status === 'accepted')
  );
}
