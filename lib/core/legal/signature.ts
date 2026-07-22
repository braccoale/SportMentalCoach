/**
 * Typed-name signature matching for the documents that are signed rather than
 * merely ticked (today: the coach agreement).
 *
 * Plain module — deliberately NOT `server-only` — for the same reason as
 * `guardians/age.ts`: the signing form and the server action must validate a
 * signature against the exact same rule, and a rule that exists twice is a
 * rule that will disagree with itself.
 */

/** Lowercase, unaccented, with runs of whitespace collapsed to one space. */
function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    // Strip the combining marks that NFD just separated out, so "Nicolò" and
    // "Nicolo" compare equal. A signature is evidence of intent, not a
    // spelling test.
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether a typed signature matches the account holder's name.
 *
 * The reversed order is accepted because "Rossi Mario" is how half of Italy
 * fills in a form, and rejecting it would add friction without adding a shred
 * of evidential value. Everything else must match: a signature that is not the
 * signatory's name proves nothing about who signed.
 *
 * Both name parts are required. An account without a surname cannot produce a
 * valid signature — which is why the signing page asks the coach to complete
 * their profile first.
 */
export function signatureMatchesName(
  signature: string,
  name: string | null,
  lastName: string | null
): boolean {
  const first = normalizeName(name ?? '');
  const last = normalizeName(lastName ?? '');
  if (!first || !last) return false;

  const signed = normalizeName(signature);
  return signed === `${first} ${last}` || signed === `${last} ${first}`;
}
