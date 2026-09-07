import type { FeatureAccessResult, FeatureEntitlementSnapshot } from './policy';
import { evaluateFeatureEntitlement } from './policy';

/**
 * `true` se l'entitlement diretta è già la risposta definitiva: concessa,
 * oppure negata da una decisione esplicita (`disabled` — un admin ha
 * revocato — o `suspended`). In nessuno dei due casi un pacchetto deve
 * essere anche solo interrogato: la regola vive qui, non duplicata nel
 * chiamante che decide se saltare la query.
 */
export function directResultIsFinal(result: FeatureAccessResult): boolean {
  return (
    result.allowed || result.reason === 'disabled' || result.reason === 'suspended'
  );
}

/**
 * Combina l'entitlement diretta dell'utente con le concessioni da pacchetto.
 *
 * Un diniego esplicito — `disabled` (un admin ha revocato) o `suspended` —
 * non si ripara con un pacchetto: è una decisione, non l'assenza di una.
 * Solo l'assenza di entitlement (`not_entitled`), una finestra non ancora
 * iniziata, una scaduta o un limite d'uso raggiunto lasciano spazio a un
 * pacchetto, che resta un percorso di concessione indipendente.
 */
export function composeFeatureAccess(
  directResult: FeatureAccessResult,
  packageGrants: readonly FeatureEntitlementSnapshot[],
  now: Date
): FeatureAccessResult {
  if (directResultIsFinal(directResult)) {
    return directResult;
  }

  let firstPackageDenial: FeatureAccessResult | null = null;
  for (const grant of packageGrants) {
    const result = evaluateFeatureEntitlement(grant, now);
    if (result.allowed) return result;
    if (!firstPackageDenial) firstPackageDenial = result;
  }

  if (directResult.reason === 'not_entitled' && firstPackageDenial) {
    return firstPackageDenial;
  }
  return directResult;
}
