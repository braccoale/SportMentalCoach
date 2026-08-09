import 'server-only';
import { hasRole } from '@/lib/core/auth/roles';
import { FEATURE_CODES, hasFeatureEntitlement } from '@/lib/core/features';
import {
  effectiveSessionCompassPromptVersion,
  openAiSessionCompassProviderFromEnvironment,
} from './openai-session-compass-provider';
import { createSessionCompassStore } from './session-compass-store';
import { listSessionBookmarksMs } from './coach-bookmarks-store';
import { loadClosingNote } from './session-close';
import { advanceAiNotesSessionStatus } from './session-status';
import { loadActiveHouseGuidelines } from './house-guidelines';
import { promptVersionWithGuidelines } from './house-guidelines-policy';
import { listSessionVoiceNoteTranscripts } from './voice-notes';
import { createSessionCommitmentStore } from './session-commitments-store';
import {
  compassSourceFingerprint,
  type SessionCompassDependencies,
} from './session-compass';

/** Composizione di produzione. I test compongono le proprie dipendenze. */
export function sessionCompassDependencies(): SessionCompassDependencies {
  return {
    store: createSessionCompassStore(),
    commitments: createSessionCommitmentStore(),
    createProvider: (promptVersion: string) =>
      openAiSessionCompassProviderFromEnvironment(
        process.env,
        undefined,
        promptVersion
      ),
    /*
     * La versione comprende quella delle linee guida attive: senza,
     * l'academy aggiornerebbe il metodo e i report continuerebbero a uscire
     * con quello vecchio, perche' la rigenerazione confronta proprio questa
     * stringa.
     */
    loadPromptVersion: async () =>
      promptVersionWithGuidelines(
        effectiveSessionCompassPromptVersion(
          process.env.AI_NOTES_COMPASS_PROMPT_VERSION ?? ''
        ),
        (await loadActiveHouseGuidelines())?.version ?? null
      ),
    loadHouseGuidelines: async () =>
      (await loadActiveHouseGuidelines())?.body ?? null,
    sourceFingerprint: compassSourceFingerprint,
    isAdmin: (actorUserId: number) => hasRole(actorUserId, 'admin'),
    hasFeatureAccess: (actorUserId: number) =>
      hasFeatureEntitlement(actorUserId, FEATURE_CODES.AI_SESSION_NOTES),
    // Cio' che il coach ha lasciato durante e dopo la seduta: i segnalibri
    // dicono al modello dove guardare, le note gli danno il contesto che la
    // trascrizione non puo' avere.
    loadCoachInput: async (sessionId: number) => {
      const [bookmarks, closingNote, voiceNotes] = await Promise.all([
        listSessionBookmarksMs(sessionId),
        loadClosingNote(sessionId),
        listSessionVoiceNoteTranscripts(sessionId),
      ]);
      return {
        bookmarksMs: bookmarks,
        notes: [closingNote, ...voiceNotes].filter(
          (note): note is string => Boolean(note?.trim())
        ),
      };
    },
    markSessionApproved: async (sessionId: number, actorUserId: number) => {
      await advanceAiNotesSessionStatus({
        sessionId,
        nextStatus: 'approved',
        actorUserId,
      });
    },
    now: () => new Date(),
  };
}
