import type { AiSessionNoteStatus } from '@/lib/db/schema';
import type { SessionCoverageState } from './session-coverage';

export type AiSessionArchiveIndicator = {
  state:
    | 'recording'
    | 'processing'
    | 'transcript_ready'
    | 'report_processing'
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
    state: 'report_processing',
    label:
      viewerRole === 'coach'
        ? 'Trascrizione pronta · Compass in elaborazione'
        : 'Trascrizione pronta · report in preparazione',
  };
}

/**
 * Aggiunge all'etichetta ciò che non va, quando non va.
 *
 * Il parametro è opzionale e una copertura integra non cambia nulla: in lista
 * una sessione riuscita non deve portare rumore. Ciò che deve emergere è il
 * contrario — una seduta con buchi non può sembrare identica a una completa.
 */
function withCoverage(
  indicator: AiSessionArchiveIndicator | null,
  coverageState?: SessionCoverageState
): AiSessionArchiveIndicator | null {
  if (!indicator || !coverageState) return indicator;
  switch (coverageState) {
    case 'con_interruzioni':
      return { ...indicator, label: `${indicator.label} · con interruzioni` };
    case 'parziale':
      return { ...indicator, label: `${indicator.label} · copertura parziale` };
    case 'fallita':
      return { state: 'failed', label: 'Sessione non registrata' };
    default:
      return indicator;
  }
}

export function buildAiSessionArchiveIndicator(
  status: AiSessionNoteStatus | null,
  viewerRole: 'coach' | 'athlete',
  hasRecordedAudio = false,
  hasTranscript = false,
  coverageState?: SessionCoverageState
): AiSessionArchiveIndicator | null {
  return withCoverage(
    baseIndicator(status, viewerRole, hasRecordedAudio, hasTranscript),
    coverageState
  );
}

function baseIndicator(
  status: AiSessionNoteStatus | null,
  viewerRole: 'coach' | 'athlete',
  hasRecordedAudio: boolean,
  hasTranscript: boolean
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
