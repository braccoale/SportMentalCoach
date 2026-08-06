import type { AiSessionNoteStatus } from '@/lib/db/schema';

export type AiSessionArchiveIndicator = {
  state:
    | 'recording'
    | 'processing'
    | 'transcript_ready'
    | 'ready'
    | 'approved'
    | 'shared'
    | 'failed';
  label: string;
};

function transcriptReadyIndicator(
  viewerRole: 'coach' | 'athlete'
): AiSessionArchiveIndicator {
  return {
    state: 'transcript_ready',
    label:
      viewerRole === 'coach'
        ? 'Trascrizione pronta · genera Compass'
        : 'Trascrizione pronta · report in preparazione',
  };
}

export function buildAiSessionArchiveIndicator(
  status: AiSessionNoteStatus | null,
  viewerRole: 'coach' | 'athlete',
  hasRecordedAudio = false,
  hasTranscript = false
): AiSessionArchiveIndicator | null {
  switch (status) {
    case 'active':
      // `active` descrive il ciclo della sessione, non lo stato fisico dei
      // file. Fra la chiusura dell'egress e l'avanzamento del worker l'audio è
      // già al sicuro: in quel tratto non va più mostrato come registrazione
      // ancora aperta.
      if (hasTranscript) return transcriptReadyIndicator(viewerRole);
      return hasRecordedAudio
        ? { state: 'processing', label: 'Registrata · trascrizione in corso' }
        : { state: 'recording', label: 'Registrazione in corso' };
    case 'processing':
      if (hasTranscript) return transcriptReadyIndicator(viewerRole);
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
