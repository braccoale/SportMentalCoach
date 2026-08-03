export type FillerMode = 'NONE' | 'LIGHT' | 'FULL';

export type TranscriptParticipant = {
  id: string | number;
  role: string;
  label?: string;
  providerSpeakerIds?: readonly string[];
};

export type RawTranscriptSegment = {
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
  providerSpeakerId?: string;
  participantId?: string | number | null;
  speakerRole?: string;
};

export type NormalizedTranscriptSegment = {
  segmentId: string;
  speaker: {
    participantId: string | number;
    role: string;
    label: string;
  };
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
  overlap: boolean;
  sourceSegmentCount: number;
};

export type NormalizedTranscriptMetadata = {
  provider: string;
  model: string;
  language: string;
  durationMs: number;
  speakerCount: number;
  segmentCount: number;
  wordCount: number;
  averageConfidence: number | null;
  minimumConfidence: number | null;
  maximumConfidence: number | null;
  createdAt: string;
};

export type NormalizedTranscript = {
  segments: NormalizedTranscriptSegment[];
  metadata: NormalizedTranscriptMetadata;
};

export type TranscriptNormalizationOptions = {
  gapMergeThresholdMs?: number;
  fillerMode?: FillerMode;
  fillerDictionary?: {
    light?: readonly string[];
    full?: readonly string[];
  };
};

export type NormalizeTranscriptInput = {
  provider: string;
  model: string;
  language: string;
  createdAt: Date | string;
  participants: readonly TranscriptParticipant[];
  segments: readonly RawTranscriptSegment[];
  options?: TranscriptNormalizationOptions;
};

type MappedSpeaker = NormalizedTranscriptSegment['speaker'];

type WorkingSegment = {
  segmentId: string;
  speaker: MappedSpeaker;
  startMs: number;
  endMs: number;
  text: string;
  confidences: number[];
  sourceSegmentCount: number;
  sourceIndex: number;
};

const DEFAULT_LIGHT_FILLERS = ['eh', 'ehm', 'em', 'mmm', 'uh', 'um'];
const DEFAULT_FULL_FILLERS = [
  'allora',
  'cioe',
  'cioè',
  'diciamo',
  'praticamente',
];

/**
 * Deterministic, provider-neutral transcript transformation. It only applies
 * explicit speaker maps, configured dictionaries, and text formatting rules.
 * It never calls a model or infers semantic meaning.
 */
export function normalizeTranscript(
  input: NormalizeTranscriptInput
): NormalizedTranscript {
  const options = input.options ?? {};
  const gapMergeThresholdMs = options.gapMergeThresholdMs ?? 750;
  if (
    !Number.isInteger(gapMergeThresholdMs) ||
    gapMergeThresholdMs < 0
  ) {
    throw new Error('INVALID_GAP_MERGE_THRESHOLD');
  }

  const participants = participantIndexes(input.participants);
  const mapped = input.segments.map((segment, sourceIndex) =>
    mapSegment(segment, sourceIndex, participants)
  );
  mapped.sort(
    (left, right) =>
      left.startMs - right.startMs ||
      left.endMs - right.endMs ||
      left.speaker.role.localeCompare(right.speaker.role) ||
      left.sourceIndex - right.sourceIndex
  );

  const mergedSegments = mergeAdjacent(mapped);
  const gapMergedSegments = mergeGaps(
    mergedSegments,
    gapMergeThresholdMs
  );
  const fillerValues = configuredFillers(options);
  const normalized = gapMergedSegments.flatMap((segment) => {
    const text = normalizeSentence(
      removeFillers(segment.text, fillerValues)
    );
    if (!text) return [];
    return [{ ...segment, text }];
  });
  const sessionConfidences = normalized.flatMap((segment) => segment.confidences);
  const segments = detectOverlaps(normalized);
  const firstStart = segments[0]?.startMs ?? 0;
  const finalEnd = segments.reduce(
    (latest, segment) => Math.max(latest, segment.endMs),
    firstStart
  );

  return {
    segments,
    metadata: {
      provider: input.provider,
      model: input.model,
      language: input.language,
      durationMs: finalEnd - firstStart,
      speakerCount: new Set(
        segments.map((segment) => String(segment.speaker.participantId))
      ).size,
      segmentCount: segments.length,
      wordCount: segments.reduce(
        (count, segment) => count + countWords(segment.text),
        0
      ),
      averageConfidence: average(sessionConfidences),
      minimumConfidence: sessionConfidences.length
        ? Math.min(...sessionConfidences)
        : null,
      maximumConfidence: sessionConfidences.length
        ? Math.max(...sessionConfidences)
        : null,
      createdAt:
        input.createdAt instanceof Date
          ? input.createdAt.toISOString()
          : input.createdAt,
    },
  };
}

function participantIndexes(participants: readonly TranscriptParticipant[]): {
  byId: Map<string, TranscriptParticipant>;
  byProviderSpeakerId: Map<string, TranscriptParticipant>;
  byRole: Map<string, TranscriptParticipant[]>;
} {
  const byId = new Map<string, TranscriptParticipant>();
  const byProviderSpeakerId = new Map<string, TranscriptParticipant>();
  const byRole = new Map<string, TranscriptParticipant[]>();
  for (const participant of participants) {
    const id = String(participant.id);
    if (byId.has(id)) throw new Error('DUPLICATE_TRANSCRIPT_PARTICIPANT');
    byId.set(id, participant);
    const roleEntries = byRole.get(participant.role) ?? [];
    roleEntries.push(participant);
    byRole.set(participant.role, roleEntries);
    for (const providerSpeakerId of participant.providerSpeakerIds ?? []) {
      if (byProviderSpeakerId.has(providerSpeakerId)) {
        throw new Error('DUPLICATE_PROVIDER_SPEAKER_MAPPING');
      }
      byProviderSpeakerId.set(providerSpeakerId, participant);
    }
  }
  return { byId, byProviderSpeakerId, byRole };
}

function mapSegment(
  segment: RawTranscriptSegment,
  sourceIndex: number,
  participants: ReturnType<typeof participantIndexes>
): WorkingSegment {
  if (
    !Number.isInteger(segment.startMs) ||
    !Number.isInteger(segment.endMs) ||
    segment.startMs < 0 ||
    segment.endMs < segment.startMs
  ) {
    throw new Error('INVALID_TRANSCRIPT_SEGMENT_TIMING');
  }
  if (
    segment.confidence !== undefined &&
    (!Number.isFinite(segment.confidence) ||
      segment.confidence < 0 ||
      segment.confidence > 1)
  ) {
    throw new Error('INVALID_TRANSCRIPT_CONFIDENCE');
  }
  const speaker = resolveSpeaker(segment, participants);
  return {
    segmentId: `normalized-${sourceIndex + 1}`,
    speaker,
    startMs: segment.startMs,
    endMs: segment.endMs,
    text: segment.text,
    confidences:
      segment.confidence === undefined ? [] : [segment.confidence],
    sourceSegmentCount: 1,
    sourceIndex,
  };
}

function resolveSpeaker(
  segment: RawTranscriptSegment,
  participants: ReturnType<typeof participantIndexes>
): MappedSpeaker {
  const byProvider = segment.providerSpeakerId
    ? participants.byProviderSpeakerId.get(segment.providerSpeakerId)
    : undefined;
  const byParticipantId =
    segment.participantId === undefined || segment.participantId === null
      ? undefined
      : participants.byId.get(String(segment.participantId));
  const roleMatches = segment.speakerRole
    ? participants.byRole.get(segment.speakerRole) ?? []
    : [];
  const byRole = roleMatches.length === 1 ? roleMatches[0] : undefined;
  const candidates = [byProvider, byParticipantId, byRole].filter(
    (participant): participant is TranscriptParticipant => !!participant
  );
  const participant = candidates[0];
  if (!participant || candidates.some((candidate) => candidate !== participant)) {
    throw new Error('UNMAPPED_TRANSCRIPT_SPEAKER');
  }
  return {
    participantId: participant.id,
    role: participant.role,
    label: participant.label ?? displayRole(participant.role),
  };
}

function displayRole(role: string): string {
  return role ? `${role.slice(0, 1).toUpperCase()}${role.slice(1)}` : 'Participant';
}

function mergeAdjacent(segments: WorkingSegment[]): WorkingSegment[] {
  return mergeSegments(segments, (current, next) =>
    next.startMs === current.endMs
  );
}

function mergeGaps(
  segments: WorkingSegment[],
  gapMergeThresholdMs: number
): WorkingSegment[] {
  return mergeSegments(segments, (current, next) => {
    const gap = next.startMs - current.endMs;
    return gap > 0 && gap <= gapMergeThresholdMs;
  });
}

function mergeSegments(
  segments: WorkingSegment[],
  canMerge: (current: WorkingSegment, next: WorkingSegment) => boolean
): WorkingSegment[] {
  const merged: WorkingSegment[] = [];
  for (const segment of segments) {
    const current = merged.at(-1);
    if (
      current &&
      sameSpeaker(current.speaker, segment.speaker) &&
      segment.startMs >= current.endMs &&
      canMerge(current, segment)
    ) {
      current.endMs = segment.endMs;
      current.text = `${current.text} ${segment.text}`;
      current.confidences.push(...segment.confidences);
      current.sourceSegmentCount += segment.sourceSegmentCount;
      continue;
    }
    merged.push({ ...segment, confidences: [...segment.confidences] });
  }
  return merged;
}

function sameSpeaker(left: MappedSpeaker, right: MappedSpeaker): boolean {
  return String(left.participantId) === String(right.participantId);
}

function detectOverlaps(
  segments: WorkingSegment[]
): NormalizedTranscriptSegment[] {
  let latestEnd = 0;
  return segments.map((segment) => {
    const overlap = segment.startMs < latestEnd;
    latestEnd = Math.max(latestEnd, segment.endMs);
    return {
      segmentId: segment.segmentId,
      speaker: segment.speaker,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
      confidence: average(segment.confidences),
      overlap,
      sourceSegmentCount: segment.sourceSegmentCount,
    };
  });
}

function configuredFillers(
  options: TranscriptNormalizationOptions
): readonly string[] {
  const fillerMode = options.fillerMode ?? 'NONE';
  if (fillerMode === 'NONE') return [];
  const light = options.fillerDictionary?.light ?? DEFAULT_LIGHT_FILLERS;
  if (fillerMode === 'FULL') {
    return [...light, ...(options.fillerDictionary?.full ?? DEFAULT_FULL_FILLERS)];
  }
  return light;
}

function removeFillers(value: string, fillers: readonly string[]): string {
  if (!fillers.length) return value;
  const alternatives = [...new Set(fillers.map((filler) => filler.trim()))]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|');
  if (!alternatives) return value;
  return value.replace(
    new RegExp(`(^|[\\s,.;:!?])(?:${alternatives})(?=$|[\\s,.;:!?])`, 'giu'),
    '$1'
  );
}

function normalizeSentence(value: string): string {
  let normalized = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])\1+/g, '$1')
    .replace(/^[,.;:!?]+\s*/g, '')
    .replace(/\s+([)\]])/g, '$1')
    .replace(/([(\[])\s+/g, '$1')
    .trim();
  if (!normalized) return '';
  normalized = capitalizeFirst(normalized);
  normalized = normalized.replace(
    /([.!?]\s+)([\p{Ll}])/gu,
    (_match, boundary: string, letter: string) =>
      `${boundary}${letter.toLocaleUpperCase('it-IT')}`
  );
  if (/[\p{L}\p{N}\]\)]$/u.test(normalized)) {
    normalized = `${normalized}.`;
  } else if (/[,;:]$/u.test(normalized)) {
    normalized = `${normalized.slice(0, -1)}.`;
  }
  return normalized;
}

function capitalizeFirst(value: string): string {
  return value.replace(
    /\p{Ll}/u,
    (letter) => letter.toLocaleUpperCase('it-IT')
  );
}

function countWords(value: string): number {
  return value.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function average(values: readonly number[]): number | null {
  if (!values.length) return null;
  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
