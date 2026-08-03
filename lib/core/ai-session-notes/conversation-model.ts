import type {
  NormalizedTranscript,
  NormalizedTranscriptSegment,
} from './transcript-normalization';

export type ConversationParticipant = {
  speakerId: string | number;
  speakerRole: string;
  speakerName: string;
};

export type ConversationTurn = {
  turnIndex: number;
  speakerId: string | number;
  speakerRole: string;
  speakerName: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  text: string;
  wordCount: number;
  confidence: number | null;
  overlap: boolean;
  segmentIds: string[];
};

export type ConversationStatistics = {
  conversationDuration: number;
  participantCount: number;
  turnCount: number;
  averageTurnDuration: number;
  averageWordsPerTurn: number;
  averageConfidence: number | null;
};

export type ConversationModel = {
  conversationId: string;
  sessionId: string | number;
  language: string;
  participants: ConversationParticipant[];
  turns: ConversationTurn[];
  statistics: ConversationStatistics;
};

export type ConversationFromTranscriptInput = {
  conversationId: string;
  sessionId: string | number;
  transcript: NormalizedTranscript;
};

/**
 * Converts a normalized transcript into provider-neutral turn structure.
 * It joins only consecutive segments from the same already-mapped speaker.
 * No content is inferred, rewritten, or interpreted.
 */
export function conversationFromTranscript(
  input: ConversationFromTranscriptInput
): ConversationModel {
  if (!input.conversationId.trim()) {
    throw new Error('INVALID_CONVERSATION_ID');
  }
  if (!validIdentifier(input.sessionId)) {
    throw new Error('INVALID_CONVERSATION_SESSION_ID');
  }
  validateNormalizedTranscript(input.transcript);

  const participants = participantsFromSegments(input.transcript.segments);
  const turns = turnsFromSegments(input.transcript.segments);
  const conversation: ConversationModel = {
    conversationId: input.conversationId,
    sessionId: input.sessionId,
    language: input.transcript.metadata.language,
    participants,
    turns,
    statistics: {
      conversationDuration: 0,
      participantCount: 0,
      turnCount: 0,
      averageTurnDuration: 0,
      averageWordsPerTurn: 0,
      averageConfidence: null,
    },
  };
  conversation.statistics = conversationStatistics(conversation);
  validateConversation(conversation);
  return conversation;
}

export function conversationStatistics(
  conversation: Pick<ConversationModel, 'participants' | 'turns'>
): ConversationStatistics {
  const turns = conversation.turns;
  const firstStart = turns[0]?.startMs ?? 0;
  const finalEnd = turns.reduce(
    (latest, turn) => Math.max(latest, turn.endMs),
    firstStart
  );
  const confidences = turns.flatMap((turn) =>
    turn.confidence === null ? [] : [turn.confidence]
  );
  return {
    conversationDuration: finalEnd - firstStart,
    participantCount: conversation.participants.length,
    turnCount: turns.length,
    averageTurnDuration: average(turns.map((turn) => turn.durationMs)) ?? 0,
    averageWordsPerTurn: average(turns.map((turn) => turn.wordCount)) ?? 0,
    averageConfidence: average(confidences),
  };
}

export function validateConversation(conversation: ConversationModel): void {
  if (!conversation.conversationId.trim()) {
    throw new Error('INVALID_CONVERSATION_ID');
  }
  if (!validIdentifier(conversation.sessionId)) {
    throw new Error('INVALID_CONVERSATION_SESSION_ID');
  }
  if (!conversation.language.trim()) {
    throw new Error('INVALID_CONVERSATION_LANGUAGE');
  }
  const participants = new Map<string, ConversationParticipant>();
  for (const participant of conversation.participants) {
    const id = String(participant.speakerId);
    if (
      !validIdentifier(participant.speakerId) ||
      !participant.speakerRole.trim() ||
      !participant.speakerName.trim() ||
      participants.has(id)
    ) {
      throw new Error('INVALID_CONVERSATION_PARTICIPANT');
    }
    participants.set(id, participant);
  }

  let previousStart = -1;
  const segmentIds = new Set<string>();
  for (const [index, turn] of conversation.turns.entries()) {
    if (turn.turnIndex !== index + 1 || turn.startMs < previousStart) {
      throw new Error('INVALID_CONVERSATION_TURN_ORDER');
    }
    if (
      !Number.isInteger(turn.startMs) ||
      !Number.isInteger(turn.endMs) ||
      turn.startMs < 0 ||
      turn.endMs <= turn.startMs ||
      turn.durationMs !== turn.endMs - turn.startMs ||
      !turn.text.trim() ||
      turn.wordCount !== countWords(turn.text) ||
      !validConfidence(turn.confidence) ||
      !turn.segmentIds.length
    ) {
      throw new Error('INVALID_CONVERSATION_TURN');
    }
    const participant = participants.get(String(turn.speakerId));
    if (
      !participant ||
      participant.speakerRole !== turn.speakerRole ||
      participant.speakerName !== turn.speakerName
    ) {
      throw new Error('INVALID_CONVERSATION_TURN_SPEAKER');
    }
    for (const segmentId of turn.segmentIds) {
      if (!segmentId.trim() || segmentIds.has(segmentId)) {
        throw new Error('INVALID_CONVERSATION_SEGMENT_REFERENCE');
      }
      segmentIds.add(segmentId);
    }
    previousStart = turn.startMs;
  }

  const expected = conversationStatistics(conversation);
  if (!sameStatistics(conversation.statistics, expected)) {
    throw new Error('INVALID_CONVERSATION_STATISTICS');
  }
}

function validateNormalizedTranscript(transcript: NormalizedTranscript): void {
  if (!transcript.metadata.language.trim()) {
    throw new Error('INVALID_NORMALIZED_TRANSCRIPT_LANGUAGE');
  }
  let previousStart = -1;
  const segmentIds = new Set<string>();
  for (const segment of transcript.segments) {
    if (
      !segment.segmentId.trim() ||
      segmentIds.has(segment.segmentId) ||
      !validIdentifier(segment.speaker.participantId) ||
      !segment.speaker.role.trim() ||
      !segment.speaker.label.trim() ||
      !Number.isInteger(segment.startMs) ||
      !Number.isInteger(segment.endMs) ||
      segment.startMs < previousStart ||
      segment.startMs < 0 ||
      segment.endMs <= segment.startMs ||
      !segment.text.trim() ||
      !validConfidence(segment.confidence)
    ) {
      throw new Error('INVALID_NORMALIZED_TRANSCRIPT');
    }
    segmentIds.add(segment.segmentId);
    previousStart = segment.startMs;
  }
}

function participantsFromSegments(
  segments: readonly NormalizedTranscriptSegment[]
): ConversationParticipant[] {
  const participants = new Map<string, ConversationParticipant>();
  for (const segment of segments) {
    const participant: ConversationParticipant = {
      speakerId: segment.speaker.participantId,
      speakerRole: segment.speaker.role,
      speakerName: segment.speaker.label,
    };
    const key = String(participant.speakerId);
    const existing = participants.get(key);
    if (
      existing &&
      (existing.speakerRole !== participant.speakerRole ||
        existing.speakerName !== participant.speakerName)
    ) {
      throw new Error('INCONSISTENT_NORMALIZED_TRANSCRIPT_SPEAKER');
    }
    participants.set(key, participant);
  }
  return [...participants.values()];
}

function turnsFromSegments(
  segments: readonly NormalizedTranscriptSegment[]
): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  const confidencesByTurn = new Map<ConversationTurn, number[]>();
  for (const segment of segments) {
    const current = turns.at(-1);
    if (current && String(current.speakerId) === String(segment.speaker.participantId)) {
      current.endMs = Math.max(current.endMs, segment.endMs);
      current.durationMs = current.endMs - current.startMs;
      current.text = `${current.text} ${segment.text}`;
      current.wordCount += countWords(segment.text);
      const confidences = confidencesByTurn.get(current)!;
      confidences.push(...confidenceValues(segment.confidence));
      current.confidence = average(confidences);
      current.overlap ||= segment.overlap;
      current.segmentIds.push(segment.segmentId);
      continue;
    }
    const turn: ConversationTurn = {
      turnIndex: turns.length + 1,
      speakerId: segment.speaker.participantId,
      speakerRole: segment.speaker.role,
      speakerName: segment.speaker.label,
      startMs: segment.startMs,
      endMs: segment.endMs,
      durationMs: segment.endMs - segment.startMs,
      text: segment.text,
      wordCount: countWords(segment.text),
      confidence: segment.confidence,
      overlap: segment.overlap,
      segmentIds: [segment.segmentId],
    };
    turns.push(turn);
    confidencesByTurn.set(turn, confidenceValues(segment.confidence));
  }
  return turns;
}

function validIdentifier(value: string | number): boolean {
  return typeof value === 'string'
    ? Boolean(value.trim())
    : Number.isInteger(value) && value >= 0;
}

function validConfidence(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0 && value <= 1);
}

function confidenceValues(value: number | null): number[] {
  return value === null ? [] : [value];
}

function countWords(value: string): number {
  return value.match(/[\p{L}\p{N}]+(?:['â€™-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function average(values: readonly number[]): number | null {
  if (!values.length) return null;
  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)
  );
}

function sameStatistics(
  left: ConversationStatistics,
  right: ConversationStatistics
): boolean {
  return (
    left.conversationDuration === right.conversationDuration &&
    left.participantCount === right.participantCount &&
    left.turnCount === right.turnCount &&
    left.averageTurnDuration === right.averageTurnDuration &&
    left.averageWordsPerTurn === right.averageWordsPerTurn &&
    left.averageConfidence === right.averageConfidence
  );
}
