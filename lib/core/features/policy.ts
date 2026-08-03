import type {
  FeatureEntitlementSource,
  FeatureEntitlementStatus,
} from '@/lib/db/schema';

export const FEATURE_CODES = {
  AI_SESSION_NOTES: 'AI_SESSION_NOTES',
} as const;

export type FeatureCode = (typeof FEATURE_CODES)[keyof typeof FEATURE_CODES];

export type FeatureAccessReason =
  | 'enabled'
  | 'not_entitled'
  | 'disabled'
  | 'not_started'
  | 'expired'
  | 'suspended'
  | 'usage_limit_reached';

export type FeatureEntitlementSnapshot = {
  id?: number;
  status: FeatureEntitlementStatus;
  source: FeatureEntitlementSource;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
};

export type FeatureAccessResult = {
  allowed: boolean;
  reason: FeatureAccessReason;
  entitlement?: {
    source: FeatureEntitlementSource;
    startsAt?: string;
    expiresAt?: string;
    usageLimit?: number;
    usageCount: number;
  };
};

function publicEntitlement(
  entitlement: FeatureEntitlementSnapshot
): NonNullable<FeatureAccessResult['entitlement']> {
  return {
    source: entitlement.source,
    startsAt: entitlement.startsAt?.toISOString(),
    expiresAt: entitlement.expiresAt?.toISOString(),
    usageLimit: entitlement.usageLimit ?? undefined,
    usageCount: entitlement.usageCount,
  };
}

/** Pure entitlement evaluator shared by normal reads and locked start flows. */
export function evaluateFeatureEntitlement(
  entitlement: FeatureEntitlementSnapshot | null,
  now = new Date()
): FeatureAccessResult {
  if (!entitlement) {
    return { allowed: false, reason: 'not_entitled' };
  }

  const result = { entitlement: publicEntitlement(entitlement) };
  if (entitlement.status === 'suspended') {
    return { allowed: false, reason: 'suspended', ...result };
  }
  if (entitlement.status === 'expired') {
    return { allowed: false, reason: 'expired', ...result };
  }
  if (entitlement.status === 'disabled') {
    return { allowed: false, reason: 'disabled', ...result };
  }
  if (entitlement.startsAt && entitlement.startsAt > now) {
    return { allowed: false, reason: 'not_started', ...result };
  }
  if (entitlement.expiresAt && entitlement.expiresAt <= now) {
    return { allowed: false, reason: 'expired', ...result };
  }
  if (
    entitlement.usageLimit !== null &&
    entitlement.usageCount >= entitlement.usageLimit
  ) {
    return { allowed: false, reason: 'usage_limit_reached', ...result };
  }

  return { allowed: true, reason: 'enabled', ...result };
}
