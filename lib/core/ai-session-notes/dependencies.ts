import 'server-only';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import { createProductionAudioStorage, type AudioStorage } from './audio-storage';
import { getAudioRecordingConfig } from './recording-config';
import { getSpeechToTextProvider, type SpeechToTextProvider } from './providers';
import { ProductionLiveKitSessionControl, type LiveKitSessionControl } from './livekit-session-control';

export type Clock = { now(): Date };
export type SessionCompassJobRunner = (params: {
  sessionId: number;
  actorUserId: number;
}) => Promise<{ providerOperationId?: string }>;
export type AiSessionNotesDependencies = { db: DbOrTx; audioStorage: AudioStorage; speechToTextProvider: SpeechToTextProvider; clock: Clock; liveKit: LiveKitSessionControl; generateSessionCompass?: SessionCompassJobRunner };
let productionDependencyCreationGuard: (() => void) | null = null;
export function createProductionAiSessionNotesDependencies(): AiSessionNotesDependencies {
  productionDependencyCreationGuard?.();
  const config = getAudioRecordingConfig();
  return {
    db,
    audioStorage: createProductionAudioStorage(config),
    speechToTextProvider: getSpeechToTextProvider().provider,
    clock: { now: () => new Date() },
    liveKit: new ProductionLiveKitSessionControl(config),
    generateSessionCompass: async ({ sessionId, actorUserId }) => {
      // Caricamento lazy: i test del worker possono iniettare la propria
      // implementazione senza importare il runtime Next/Auth di produzione.
      const [{ ensureSessionCompassDraft }, { sessionCompassDependencies }] =
        await Promise.all([
          import('./session-compass'),
          import('./session-compass-runtime'),
        ]);
      const result = await ensureSessionCompassDraft(
        { sessionId, actorUserId },
        sessionCompassDependencies()
      );
      return {
        providerOperationId: `session-compass:${result.view.reportId}:v${result.view.reportVersion}`,
      };
    },
  };
}
export function createTestAiSessionNotesDependencies(
  dependencies: AiSessionNotesDependencies,
  options?: { onProductionDependencyCreation?: () => void }
): AiSessionNotesDependencies {
  productionDependencyCreationGuard =
    options?.onProductionDependencyCreation ?? null;
  return dependencies;
}
