export const GUARDIAN_RELATIONSHIPS = [
  'madre',
  'padre',
  'tutore-legale',
] as const;

export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];

export const AUTHORITY_BASES = [
  'joint_agreement',
  'sole_responsibility',
  'legal_guardian',
] as const;

export type AuthorityBasis = (typeof AUTHORITY_BASES)[number];

export function isGuardianRelationship(
  value: string
): value is GuardianRelationship {
  return (GUARDIAN_RELATIONSHIPS as readonly string[]).includes(value);
}

export function isAuthorityBasis(value: string): value is AuthorityBasis {
  return (AUTHORITY_BASES as readonly string[]).includes(value);
}

export function authorityMatchesRelationship(
  relationship: GuardianRelationship,
  authorityBasis: AuthorityBasis
): boolean {
  return relationship === 'tutore-legale'
    ? authorityBasis === 'legal_guardian'
    : authorityBasis !== 'legal_guardian';
}

export function normalizeSignatureName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
}

function comparableName(value: string): string {
  return normalizeSignatureName(value).toLocaleLowerCase('it-IT');
}

export function signatureMatchesInvite(
  signatureName: string,
  invitedGuardianName: string
): boolean {
  const signature = normalizeSignatureName(signatureName);
  return (
    signature.length >= 3 &&
    signature.length <= 200 &&
    comparableName(signature) === comparableName(invitedGuardianName)
  );
}

export type GuardianOperationalState = {
  status: string | null | undefined;
  confirmedAt: Date | null | undefined;
  revokedAt: Date | null | undefined;
  activeAcceptanceId: number | null | undefined;
};

/** Fails closed: every marker of a current authorisation must agree. */
export function hasActiveGuardianAuthorization(
  value: GuardianOperationalState | null | undefined
): boolean {
  return !!(
    value &&
    value.status === 'confirmed' &&
    value.confirmedAt &&
    !value.revokedAt &&
    value.activeAcceptanceId
  );
}
