import type { FeatureAccessResult, FeatureEntitlementSnapshot } from './policy';
import { evaluateFeatureEntitlement } from './policy';

/**
 * `true` se l'entitlement diretta è già la risposta definitiva: concessa,
 * oppure negata da una decisione esplicita (`disabled` — un admin ha
 * revocato — o `suspended`). In nessuno dei due casi un pacchetto
 * dell'organizzazione deve essere anche solo interrogato: la regola vive
 * qui, non duplicata nel chiamante che decide se saltare la query.
 */
export function directResultIsFinal(result: FeatureAccessResult): boolean {
  return (
    result.allowed || result.reason === 'disabled' || result.reason === 'suspended'
  );
}

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
  if (directResultIsFinal(directResult)) {
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
