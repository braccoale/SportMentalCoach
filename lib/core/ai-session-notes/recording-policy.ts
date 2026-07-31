export type VerifiableTrack = {
  sid: string;
  type: 'audio' | 'video' | string;
  source: 'microphone' | 'camera' | 'screen_share' | string;
};

export type VerifiableParticipant = {
  identity: string;
  tracks: VerifiableTrack[];
};

export type ExpectedRecordingParticipant = {
  userId: number;
  role: 'coach' | 'athlete';
  identity: string;
};

export type VerifiedMicrophone = ExpectedRecordingParticipant & {
  trackSid: string;
};

export type RoomVerificationResult =
  | { ok: true; microphones: VerifiedMicrophone[] }
  | {
      ok: false;
      code:
        | 'UNVERIFIED_PARTICIPANT_PRESENT'
        | 'REQUIRED_PARTICIPANT_MISSING'
        | 'REQUIRED_AUDIO_TRACK_MISSING';
    };

/**
 * The allow-list is intentionally strict: only the two application identities
 * tied to the booking may be present. Display names and browser metadata never
 * participate in authorization.
 */
export function verifyRoomForTrackEgress(
  present: VerifiableParticipant[],
  expected: ExpectedRecordingParticipant[]
): RoomVerificationResult {
  const expectedByIdentity = new Map(
    expected.map((participant) => [participant.identity, participant])
  );

  if (
    present.some(
      (participant) => !expectedByIdentity.has(participant.identity)
    )
  ) {
    return { ok: false, code: 'UNVERIFIED_PARTICIPANT_PRESENT' };
  }

  const microphones: VerifiedMicrophone[] = [];
  for (const participant of expected) {
    const match = present.find(
      (candidate) => candidate.identity === participant.identity
    );
    if (!match) return { ok: false, code: 'REQUIRED_PARTICIPANT_MISSING' };

    const microphone = match.tracks.find(
      (track) =>
        track.type === 'audio' &&
        track.source === 'microphone' &&
        track.sid.length > 0
    );
    if (!microphone) {
      return { ok: false, code: 'REQUIRED_AUDIO_TRACK_MISSING' };
    }
    microphones.push({ ...participant, trackSid: microphone.sid });
  }

  return { ok: true, microphones };
}

export function isWebhookTimestampAcceptable(params: {
  createdAt: Date;
  now?: Date;
  maxAgeSeconds: number;
  maxFutureSkewSeconds?: number;
}): boolean {
  const now = params.now ?? new Date();
  const ageMs = now.getTime() - params.createdAt.getTime();
  return (
    Number.isFinite(ageMs) &&
    ageMs <= (params.maxAgeSeconds || 1) * 1_000 &&
    ageMs >= -(params.maxFutureSkewSeconds ?? 300) * 1_000
  );
}

export function isRecordingTerminal(status: string): boolean {
  return [
    'recorded',
    'failed',
    'deleted',
    'deletion_failed',
  ].includes(status);
}

export function isRecordingStoppable(status: string): boolean {
  return ['pending', 'starting', 'recording'].includes(status);
}

export type AggregateRecordingState =
  | 'not_started'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'recorded'
  | 'failed'
  | 'deleted';

export function aggregateRecordingState(
  statuses: string[]
): AggregateRecordingState {
  if (statuses.length === 0) return 'not_started';
  if (statuses.some((status) => ['failed', 'deletion_failed'].includes(status))) {
    return 'failed';
  }
  if (statuses.every((status) => status === 'deleted')) return 'deleted';
  if (statuses.some((status) => status === 'stopping')) return 'stopping';
  if (statuses.some((status) => status === 'recording')) return 'recording';
  if (statuses.some((status) => ['pending', 'starting'].includes(status))) {
    return 'starting';
  }
  return 'recorded';
}

/** Mutation APIs accept no routing/media fields from the browser. */
export function isEmptyRecordingMutationBody(raw: string): boolean {
  if (!raw.trim()) return true;
  try {
    const value = JSON.parse(raw) as unknown;
    return (
      !!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    );
  } catch {
    return false;
  }
}
