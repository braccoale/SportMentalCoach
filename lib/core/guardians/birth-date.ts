import type { Result } from '@/lib/core/result';
import {
  AGE_OF_MAJORITY,
  MIN_SIGNUP_AGE,
  ageFromBirthDate,
  requiresGuardian,
} from './age';

/**
 * Whether an athlete may change their own birth date, and to what.
 *
 * The birth date is not an ordinary profile field: it is the only input to the
 * guardian gate. `getGuardianStatus` reads `client_profiles.birth_date`,
 * derives the age, and returns `not_required` for anyone 18 or over without
 * even looking at the guardian row. So an athlete free to edit that field is
 * an athlete free to lift their own gate — a 15-year-old could open the
 * profile page, type a year that made them 18, and from that moment book
 * sessions and have them recorded and transcribed with no authorisation from
 * anyone, leaving no trace that a minor had ever been involved.
 *
 * The rule is deliberately one-directional. An edit that keeps or tightens the
 * gate is allowed; an edit that loosens it is not, and goes through support,
 * where a human can check the correction is genuine. Nobody is locked out by
 * this on their eighteenth birthday: the age is recomputed on every call, so
 * turning 18 clears the gate by itself, with no edit at all.
 *
 * Plain module (NOT `server-only`) so the profile editor and the server action
 * refuse the same edits, for the same reason as [age.ts].
 */

/** `YYYY-MM-DD`, or null when absent or unparseable. */
function isoDay(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Whether the caller supplied a value at all, as opposed to clearing it. */
function isProvided(value: string | Date | null | undefined): boolean {
  if (value == null) return false;
  return value instanceof Date ? true : value.trim() !== '';
}

export function canSelfEditBirthDate(
  current: string | Date | null | undefined,
  next: string | Date | null | undefined,
  at: Date = new Date()
): Result {
  const currentDay = isoDay(current);
  const nextDay = isoDay(next);

  // The profile form resubmits the stored value on every save, so "unchanged"
  // is the common case and must never be an error.
  if (currentDay != null && currentDay === nextDay) return { ok: true };
  if (currentDay == null && !isProvided(next)) return { ok: true };

  // Clearing is refused, and not for tidiness: an empty date is `unknown_age`,
  // which blocks booking but also erases the record of being a minor — leaving
  // the field free to be set to an adult date on the next save. Refusing here
  // is what makes the rule below impossible to walk around in two steps.
  if (currentDay != null && !isProvided(next)) {
    return {
      ok: false,
      error:
        'La data di nascita non può essere rimossa: se è sbagliata correggila, oppure scrivi all’assistenza.',
    };
  }

  const nextAge = ageFromBirthDate(nextDay, at);
  if (nextAge == null || nextAge < 0 || nextAge > 120) {
    return { ok: false, error: 'Data di nascita non valida.' };
  }
  if (nextAge < MIN_SIGNUP_AGE) {
    return {
      ok: false,
      error: `KaiPai è riservato agli atleti dai ${MIN_SIGNUP_AGE} anni in su: se la data è sbagliata scrivi all’assistenza.`,
    };
  }

  // The edit that lifts the gate. Note `requiresGuardian(null)` is false, so an
  // athlete whose date was never recorded can still set one: there is no prior
  // statement to contradict, and refusing would strand legacy accounts behind
  // `unknown_age` with no way out.
  const currentAge = ageFromBirthDate(currentDay, at);
  if (requiresGuardian(currentAge) && nextAge >= AGE_OF_MAJORITY) {
    return {
      ok: false,
      error:
        'Da questa data dipende l’autorizzazione del genitore o tutore: per correggerla in un modo che ti fa risultare maggiorenne scrivi all’assistenza.',
    };
  }

  return { ok: true };
}
