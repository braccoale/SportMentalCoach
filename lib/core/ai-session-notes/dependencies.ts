import 'server-only';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import { createProductionAudioStorage, type AudioStorage } from './audio-storage';
import { getAudioRecordingConfig } from './recording-config';
import { getSpeechToTextProvider, type SpeechToTextProvider } from './providers';
import { ProductionLiveKitSessionControl, type LiveKitSessionControl } from './livekit-session-control';

export type Clock = { now(): Date };
export type AiSessionNotesDependencies = { db: DbOrTx; audioStorage: AudioStorage; speechToTextProvider: SpeechToTextProvider; clock: Clock; liveKit: LiveKitSessionControl };
let productionDependencyCreationGuard: (() => void) | null = null;
export function createProductionAiSessionNotesDependencies(): AiSessionNotesDependencies {
  productionDependencyCreationGuard?.();
  const config = getAudioRecordingConfig();
  return { db, audioStorage: createProductionAudioStorage(config), speechToTextProvider: getSpeechToTextProvider().provider, clock: { now: () => new Date() }, liveKit: new ProductionLiveKitSessionControl(config) };
}
export function createTestAiSessionNotesDependencies(
  dependencies: AiSessionNotesDependencies,
  options?: { onProductionDependencyCreation?: () => void }
): AiSessionNotesDependencies {
  productionDependencyCreationGuard =
    options?.onProductionDependencyCreation ?? null;
  return dependencies;
}
