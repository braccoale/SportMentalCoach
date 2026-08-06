import type { AiSessionNoteStatus } from '@/lib/db/schema';

export type AiSessionArchiveIndicator = {
  state: 'recording' | 'processing' | 'ready' | 'approved' | 'shared' | 'failed';
  label: string;
};

export function buildAiSessionArchiveIndicator(
  status: AiSessionNoteStatus | null,
  viewerRole: 'coach' | 'athlete',
  hasRecordedAudio = false
): AiSessionArchiveIndicator | null {
  switch (status) {
    case 'active':
      return { state: 'recording', label: 'Registrazione in corso' };
    case 'processing':
      return {
        state: 'processing',
        label: hasRecordedAudio
          ? 'Registrata · trascrizione in corso'
          : 'Trascrizione in elaborazione',
      };
    case 'ready_for_review':
      return {
        state: 'ready',
        label: viewerRole === 'coach' ? 'Report pronto da rivedere' : 'Report in revisione',
      };
    case 'approved':
      return {
        state: 'approved',
        label: viewerRole === 'coach' ? 'Report approvato' : 'Report in preparazione',
      };
    case 'shared':
      return { state: 'shared', label: 'Report pronto' };
    case 'transcription_failed':
      return { state: 'failed', label: 'Trascrizione non riuscita' };
    case 'report_failed':
      return { state: 'failed', label: 'Report non riuscito' };
    default:
      return null;
  }
}
