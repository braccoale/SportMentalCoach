/**
 * Age rules for the platform. Plain module (NOT `server-only`) so the signup
 * form and the server action validate against the exact same thresholds.
 *
 * Two different ages matter here, and they come from different bodies of law:
 *
 *  - **15** is the product's own floor: KaiPai is not offered to younger
 *    athletes at all. It sits above Italy's digital-consent age of 14
 *    (art. 2-quinquies D.Lgs. 196/2003), which is why every user of this
 *    platform can validly consent to their own data processing.
 *  - **18** is when legal capacity is acquired (art. 2 c.c.). Below it a
 *    contract is voidable (art. 1425 c.c.) — and the Terms are a contract —
 *    so a guardian has to accept on the athlete's behalf.
 *
 * The band between the two, 15 to 17, is the only one needing a guardian.
 */

/** Youngest athlete the platform accepts. Below this, signup is refused. */
export const MIN_SIGNUP_AGE = 15;

/** Age of legal capacity: at or above it, no guardian authorisation is needed. */
export const AGE_OF_MAJORITY = 18;

/**
 * Whole years old on `at`, from a `YYYY-MM-DD` birth date. Returns null when
 * the date is missing or unparseable — callers decide what to do with an
 * unknown age rather than getting a misleading 0.
 */
export function ageFromBirthDate(
  birthDate: string | Date | null | undefined,
  at: Date = new Date()
): number | null {
  if (!birthDate) return null;
  const d = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;

  let age = at.getFullYear() - d.getFullYear();
  // Not yet had this year's birthday.
  const monthDiff = at.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && at.getDate() < d.getDate())) age--;
  return age;
}

/** Whether an athlete of this age needs a guardian's authorisation (15-17). */
export function requiresGuardian(age: number | null): boolean {
  return age != null && age >= MIN_SIGNUP_AGE && age < AGE_OF_MAJORITY;
}

/** Whether the platform accepts a signup at this age. */
export function isEligibleAge(age: number | null): boolean {
  return age != null && age >= MIN_SIGNUP_AGE;
}
