import type { UserPackageStatus } from '@/lib/db/schema';
import type { FeatureEntitlementSnapshot } from './policy';

const USER_PACKAGE_STATUS_TO_ENTITLEMENT_STATUS: Record<
  UserPackageStatus,
  FeatureEntitlementSnapshot['status']
> = {
  active: 'enabled',
  suspended: 'suspended',
  expired: 'expired',
};

/**
 * Traveste la riga corrente di `user_packages` da entitlement, così la
 * stessa `evaluateFeatureEntitlement` che decide per un'entitlement diretta
 * decide anche qui — la regola su scadenze e stati resta scritta una volta
 * sola.
 */
export function buildPackageFeatureSnapshot(params: {
  userPackage: {
    status: UserPackageStatus;
    startsAt: Date | null;
    expiresAt: Date | null;
  } | null;
  packageFeatureCodes: readonly string[];
  featureCode: string;
}): FeatureEntitlementSnapshot | null {
  if (!params.userPackage) return null;
  if (!params.packageFeatureCodes.includes(params.featureCode)) return null;

  return {
    status:
      USER_PACKAGE_STATUS_TO_ENTITLEMENT_STATUS[
        params.userPackage.status
      ],
    source: 'subscription',
    startsAt: params.userPackage.startsAt,
    expiresAt: params.userPackage.expiresAt,
    usageLimit: null,
    usageCount: 0,
  };
}
