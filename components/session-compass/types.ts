import type {
  CompassSpeaker,
  SessionCompassReport,
} from '@/lib/core/ai-session-notes/session-compass-contract';

export type TrackedCommitmentStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'skipped';

export type TrackedCommitmentView = {
  id: number;
  title: string;
  owner: CompassSpeaker;
  status: TrackedCommitmentStatus;
  dueDate: string | null;
  completedAt: string | null;
  athleteNote: string | null;
  sourceTimestampMs: number;
  sourceTranscriptSegmentId: number | null;
  sourceExcerpt: string;
  manuallyEdited: boolean;
};

export type SessionCompassView = {
  reportId: number;
  sessionId: number;
  reportVersion: number;
  status: 'generating' | 'ready_for_review' | 'approved' | 'failed';
  sourceFingerprint: string | null;
  isApproved: boolean;
  isStale: boolean;
  approvedAt: string | null;
  errorCode: string | null;
  updatedAt: string;
  document: SessionCompassReport | null;
  canEditCoachNote: boolean;
  trackedCommitments: TrackedCommitmentView[];
};

export type CompassTranscriptSegment = {
  transcriptSegmentId: number;
  startMs: number;
  endMs: number;
  minute: number;
  speaker: CompassSpeaker;
  text: string;
};

export type TranscriptHistorySearchHit = CompassTranscriptSegment & {
  sessionId: number;
  sessionDate: string | null;
  focus: string | null;
};

export type TranscriptHistorySearchResult = {
  items: TranscriptHistorySearchHit[];
  nextCursor: string | null;
};

export type TrackedCommitmentChange = {
  title?: string;
  owner?: CompassSpeaker;
  status?: TrackedCommitmentStatus;
  dueDate?: string | null;
};

export type CompassTabId =
  | 'overview'
  | 'journey'
  | 'transcript'
  | 'moments'
  | 'notes';

export const SPEAKER_LABEL: Record<CompassSpeaker, string> = {
  coach: 'Coach',
  athlete: 'Atleta',
};

export function segmentAnchorId(transcriptSegmentId: number): string {
  return `compass-segment-${transcriptSegmentId}`;
}
