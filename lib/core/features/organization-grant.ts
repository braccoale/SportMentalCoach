import type { OrganizationPackageStatus } from '@/lib/db/schema';
import type { FeatureEntitlementSnapshot } from './policy';

const ORG_PACKAGE_STATUS_TO_ENTITLEMENT_STATUS: Record<
  OrganizationPackageStatus,
  FeatureEntitlementSnapshot['status']
> = {
  active: 'enabled',
  suspended: 'suspended',
  expired: 'expired',
};

/**
 * Traveste la riga corrente di `organization_packages` da entitlement, così
 * la stessa `evaluateFeatureEntitlement` che decide per un'entitlement
 * diretta decide anche qui — la regola su scadenze e stati resta scritta
 * una volta sola.
 */
export function buildOrganizationFeatureSnapshot(params: {
  organizationPackage: {
    status: OrganizationPackageStatus;
    startsAt: Date | null;
    expiresAt: Date | null;
  } | null;
  packageFeatureCodes: readonly string[];
  featureCode: string;
}): FeatureEntitlementSnapshot | null {
  if (!params.organizationPackage) return null;
  if (!params.packageFeatureCodes.includes(params.featureCode)) return null;

  return {
    status:
      ORG_PACKAGE_STATUS_TO_ENTITLEMENT_STATUS[
        params.organizationPackage.status
      ],
    source: 'subscription',
    startsAt: params.organizationPackage.startsAt,
    expiresAt: params.organizationPackage.expiresAt,
    usageLimit: null,
    usageCount: 0,
  };
}
