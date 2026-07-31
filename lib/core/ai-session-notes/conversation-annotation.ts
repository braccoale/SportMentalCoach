import {
  validateConversation,
  type ConversationModel,
  type ConversationTurn,
} from './conversation-model';

export type QuestionType = 'open' | 'closed' | 'unknown';

export type ConversationTurnAnnotations = {
  endsWithQuestion: boolean;
  questionType: QuestionType;
  containsNumbers: boolean;
  containsTimeReference: boolean;
  containsGoalWord: boolean;
  containsEmotionWord: boolean;
  containsPause: boolean;
  longTurn: boolean;
  shortAnswer: boolean;
  overlap: boolean;
  wordCount: number;
  durationMs: number;
};

export type AnnotatedConversationTurn = ConversationTurn & {
  annotations: ConversationTurnAnnotations;
};

export type AnnotatedConversationModel = Omit<ConversationModel, 'turns'> & {
  turns: AnnotatedConversationTurn[];
};

export type ConversationAnnotationOptions = {
  questionKeywords?: {
    open?: readonly string[];
    closed?: readonly string[];
  };
  numberWords?: readonly string[];
  timeReferenceWords?: readonly string[];
  goalWords?: readonly string[];
  emotionWords?: readonly string[];
  pauseThresholdMs?: number;
  longTurnMinWordCount?: number;
  longTurnMinDurationMs?: number;
  shortAnswerMaxWordCount?: number;
  shortAnswerMaxDurationMs?: number;
};

const DEFAULT_OPEN_QUESTION_WORDS = [
  'che',
  'chi',
  'come',
  'cosa',
  'dove',
  'perche',
  'perché',
  'quale',
  'quali',
  'quando',
  'quanto',
  'quanti',
  'what',
  'when',
  'where',
  'who',
  'why',
  'which',
  'how',
];
const DEFAULT_CLOSED_QUESTION_WORDS = [
  'hai',
  'puoi',
  'sei',
  'è',
  'e',
  'sono',
  'can',
  'did',
  'do',
  'does',
  'is',
  'are',
  'will',
];
const DEFAULT_NUMBER_WORDS = [
  'zero',
  'uno',
  'una',
  'due',
  'tre',
  'quattro',
  'cinque',
  'sei',
  'sette',
  'otto',
  'nove',
  'dieci',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];
const DEFAULT_TIME_REFERENCE_WORDS = [
  'adesso',
  'anno',
  'dopo',
  'domani',
  'ieri',
  'mattina',
  'mese',
  'notte',
  'oggi',
  'pomeriggio',
  'prima',
  'sera',
  'settimana',
  'tomorrow',
  'today',
  'yesterday',
];
const DEFAULT_GOAL_WORDS = [
  'goal',
  'obiettivo',
  'obiettivi',
  'target',
  'traguardo',
  'traguardi',
];
const DEFAULT_EMOTION_WORDS = [
  'anxiety',
  'ansia',
  'ansioso',
  'ansiosa',
  'felice',
  'frustrato',
  'frustrata',
  'paura',
  'rabbia',
  'stress',
  'stressato',
  'stressata',
  'tristezza',
];

/**
 * Adds only explicit dictionary and timing annotations. The source conversation
 * is validated and never mutated; no semantic interpretation is performed.
 */
export function annotateConversation(
  conversation: ConversationModel,
  options: ConversationAnnotationOptions = {}
): AnnotatedConversationModel {
  validateConversation(conversation);
  const configuration = resolveOptions(options);
  return {
    ...conversation,
    participants: conversation.participants.map((participant) => ({
      ...participant,
    })),
    turns: conversation.turns.map((turn, index) => ({
      ...turn,
      segmentIds: [...turn.segmentIds],
      annotations: annotationsForTurn(
        turn,
        conversation.turns[index - 1],
        configuration
      ),
    })),
    statistics: { ...conversation.statistics },
  };
}

type ResolvedAnnotationOptions = {
  openQuestionWords: Set<string>;
  closedQuestionWords: Set<string>;
  numberWords: Set<string>;
  timeReferenceWords: Set<string>;
  goalWords: Set<string>;
  emotionWords: Set<string>;
  pauseThresholdMs: number;
  longTurnMinWordCount: number;
  longTurnMinDurationMs: number;
  shortAnswerMaxWordCount: number;
  shortAnswerMaxDurationMs: number;
};

function resolveOptions(
  options: ConversationAnnotationOptions
): ResolvedAnnotationOptions {
  const result = {
    openQuestionWords: wordSet(
      options.questionKeywords?.open ?? DEFAULT_OPEN_QUESTION_WORDS
    ),
    closedQuestionWords: wordSet(
      options.questionKeywords?.closed ?? DEFAULT_CLOSED_QUESTION_WORDS
    ),
    numberWords: wordSet(options.numberWords ?? DEFAULT_NUMBER_WORDS),
    timeReferenceWords: wordSet(
      options.timeReferenceWords ?? DEFAULT_TIME_REFERENCE_WORDS
    ),
    goalWords: wordSet(options.goalWords ?? DEFAULT_GOAL_WORDS),
    emotionWords: wordSet(options.emotionWords ?? DEFAULT_EMOTION_WORDS),
    pauseThresholdMs: options.pauseThresholdMs ?? 1_000,
    longTurnMinWordCount: options.longTurnMinWordCount ?? 40,
    longTurnMinDurationMs: options.longTurnMinDurationMs ?? 30_000,
    shortAnswerMaxWordCount: options.shortAnswerMaxWordCount ?? 3,
    shortAnswerMaxDurationMs: options.shortAnswerMaxDurationMs ?? 5_000,
  };
  for (const value of [
    result.pauseThresholdMs,
    result.longTurnMinWordCount,
    result.longTurnMinDurationMs,
    result.shortAnswerMaxWordCount,
    result.shortAnswerMaxDurationMs,
  ]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error('INVALID_CONVERSATION_ANNOTATION_OPTION');
    }
  }
  return result;
}

function annotationsForTurn(
  turn: ConversationTurn,
  previousTurn: ConversationTurn | undefined,
  options: ResolvedAnnotationOptions
): ConversationTurnAnnotations {
  const words = wordsIn(turn.text);
  const endsWithQuestion = turn.text.trim().endsWith('?');
  return {
    endsWithQuestion,
    questionType: questionType(words, endsWithQuestion, options),
    containsNumbers:
      words.some((word) => /^\p{N}+$/u.test(word)) ||
      containsDictionaryWord(words, options.numberWords),
    containsTimeReference: containsDictionaryWord(
      words,
      options.timeReferenceWords
    ),
    containsGoalWord: containsDictionaryWord(words, options.goalWords),
    containsEmotionWord: containsDictionaryWord(words, options.emotionWords),
    containsPause:
      previousTurn !== undefined &&
      turn.startMs - previousTurn.endMs >= options.pauseThresholdMs,
    longTurn:
      turn.wordCount >= options.longTurnMinWordCount ||
      turn.durationMs >= options.longTurnMinDurationMs,
    shortAnswer:
      turn.wordCount <= options.shortAnswerMaxWordCount &&
      turn.durationMs <= options.shortAnswerMaxDurationMs,
    overlap: turn.overlap,
    wordCount: turn.wordCount,
    durationMs: turn.durationMs,
  };
}

function questionType(
  words: readonly string[],
  endsWithQuestion: boolean,
  options: ResolvedAnnotationOptions
): QuestionType {
  if (!endsWithQuestion) return 'unknown';
  if (containsDictionaryWord(words, options.openQuestionWords)) return 'open';
  if (containsDictionaryWord(words, options.closedQuestionWords)) return 'closed';
  return 'unknown';
}

function wordSet(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.toLocaleLowerCase('it-IT').trim()));
}

function wordsIn(value: string): string[] {
  return (
    value
      .toLocaleLowerCase('it-IT')
      .match(/[\p{L}\p{N}]+(?:['â€™-][\p{L}\p{N}]+)*/gu) ?? []
  );
}

function containsDictionaryWord(
  words: readonly string[],
  dictionary: ReadonlySet<string>
): boolean {
  return words.some((word) => dictionary.has(word));
}
