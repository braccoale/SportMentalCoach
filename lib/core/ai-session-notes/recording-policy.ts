export type VerifiableTrack = {
  sid: string;
  type: 'audio' | 'video' | string;
  source: 'microphone' | 'camera' | 'screen_share' | string;
};

/**
 * `ParticipantInfo.Kind` di LiveKit. Il valore lo assegna il server e arriva
 * dentro un webhook firmato: non è manipolabile dal browser, quindi ci si può
 * basare sopra per distinguere una persona da un servizio.
 */
export const PARTICIPANT_KIND_STANDARD = 0;
export const PARTICIPANT_KIND_EGRESS = 2;

export type VerifiableParticipant = {
  identity: string;
  tracks: VerifiableTrack[];
  kind?: number;
};

/**
 * Se un partecipante comparso in stanza va trattato come intruso.
 *
 * La registrazione di LiveKit **entra nella stanza come partecipante**, con
 * un'identità generata che non è né quella del coach né quella dell'atleta.
 * Senza questa eccezione la guardia scambiava per intruso il registratore che
 * avevamo appena avviato e fermava la registrazione dopo un secondo: la
 * protezione sparava sul proprio registratore.
 *
 * L'eccezione è la più stretta possibile: vale solo per gli egress e solo
 * mentre una registrazione è davvero in corso. Un egress che compare quando
 * non abbiamo chiesto nulla è esattamente ciò da cui questa guardia protegge —
 * qualcuno che registra la sessione senza titolo — e resta un intruso. Ingress,
 * SIP e agent non li avviamo mai, quindi non sono esentati.
 */
export function isIntruderParticipant(params: {
  identity: string | undefined;
  kind: number | undefined;
  expectedIdentities: string[];
  recordingInProgress: boolean;
}): boolean {
  if (!params.identity) return false;
  if (params.expectedIdentities.includes(params.identity)) return false;
  if (
    params.kind === PARTICIPANT_KIND_EGRESS &&
    params.recordingInProgress
  ) {
    return false;
  }
  return true;
}

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
  expected: ExpectedRecordingParticipant[],
  options: { recordingInProgress?: boolean } = {}
): RoomVerificationResult {
  const expectedByIdentity = new Map(
    expected.map((participant) => [participant.identity, participant])
  );
  const expectedIdentities = expected.map(
    (participant) => participant.identity
  );

  // Stessa eccezione della guardia sui webhook: riavviando una registrazione
  // mentre un egress precedente è ancora in stanza, senza questo controllo il
  // riavvio verrebbe rifiutato per "presenza non verificata" — cioè per colpa
  // della registrazione stessa.
  if (
    present.some((participant) =>
      isIntruderParticipant({
        identity: participant.identity,
        kind: participant.kind,
        expectedIdentities,
        recordingInProgress: options.recordingInProgress ?? false,
      })
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

/**
 * Lo stato da mostrare per una sessione fatta di più segmenti.
 *
 * Ciò che sta accadendo *adesso* viene prima di ciò che è andato storto
 * prima: da quando una registrazione interrotta si può riprendere, un
 * segmento fallito resta nello storico per sempre, e se vincesse lui l'utente
 * leggerebbe "errore" mentre il microfono sta registrando. L'errore torna a
 * essere l'informazione principale appena non c'è più nulla in corso.
 */
export function aggregateRecordingState(
  statuses: string[]
): AggregateRecordingState {
  if (statuses.length === 0) return 'not_started';
  if (statuses.some((status) => status === 'stopping')) return 'stopping';
  if (statuses.some((status) => status === 'recording')) return 'recording';
  if (statuses.some((status) => ['pending', 'starting'].includes(status))) {
    return 'starting';
  }
  if (statuses.some((status) => ['failed', 'deletion_failed'].includes(status))) {
    return 'failed';
  }
  if (statuses.every((status) => status === 'deleted')) return 'deleted';
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
