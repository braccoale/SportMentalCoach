import type { FeatureAccessResult, FeatureEntitlementSnapshot } from './policy';
import { evaluateFeatureEntitlement } from './policy';

/**
 * Combina l'entitlement diretta dell'utente con le concessioni delle sue
 * organizzazioni.
 *
 * Un diniego esplicito — `disabled` (un admin ha revocato) o `suspended` —
 * non si ripara con un pacchetto: è una decisione, non l'assenza di una.
 * Solo l'assenza di entitlement (`not_entitled`), una finestra non ancora
 * iniziata, una scaduta o un limite d'uso raggiunto lasciano spazio al
 * pacchetto dell'organizzazione, che resta un percorso di concessione
 * indipendente.
 */
export function composeFeatureAccess(
  directResult: FeatureAccessResult,
  organizationGrants: readonly FeatureEntitlementSnapshot[],
  now: Date
): FeatureAccessResult {
  if (directResult.allowed) return directResult;
  if (directResult.reason === 'disabled' || directResult.reason === 'suspended') {
    return directResult;
  }

  let firstOrganizationDenial: FeatureAccessResult | null = null;
  for (const grant of organizationGrants) {
    const result = evaluateFeatureEntitlement(grant, now);
    if (result.allowed) return result;
    if (!firstOrganizationDenial) firstOrganizationDenial = result;
  }

  if (directResult.reason === 'not_entitled' && firstOrganizationDenial) {
    return firstOrganizationDenial;
  }
  return directResult;
}
