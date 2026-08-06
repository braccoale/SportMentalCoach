import 'server-only';
import { hasRole } from '@/lib/core/auth/roles';
import { FEATURE_CODES, hasFeatureEntitlement } from '@/lib/core/features';
import {
  effectiveSessionCompassPromptVersion,
  openAiSessionCompassProviderFromEnvironment,
} from './openai-session-compass-provider';
import { createSessionCompassStore } from './session-compass-store';
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
    createProvider: openAiSessionCompassProviderFromEnvironment,
    promptVersion: effectiveSessionCompassPromptVersion(
      process.env.AI_NOTES_COMPASS_PROMPT_VERSION ?? ''
    ),
    sourceFingerprint: compassSourceFingerprint,
    isAdmin: (actorUserId: number) => hasRole(actorUserId, 'admin'),
    hasFeatureAccess: (actorUserId: number) =>
      hasFeatureEntitlement(actorUserId, FEATURE_CODES.AI_SESSION_NOTES),
    now: () => new Date(),
  };
}
