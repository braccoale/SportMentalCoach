import { randomInt } from 'node:crypto';
import { fallbackAppOrigin } from '@/lib/core/site';

/**
 * Pure, dependency-free helpers for the "Invita un amico" referral codes.
 * Kept separate from the DB layer (index.ts, `server-only`) so they can be
 * unit-tested under plain Node without a database.
 */

/**
 * Uppercase base32 alphabet, minus visually ambiguous characters (0/O, 1/I).
 * 32 symbols → an 8-char code has 32^8 ≈ 1.1e12 possibilities: non-guessable,
 * and it never encodes the internal user id.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

/** A fresh random invite code, e.g. `AB12K9XQ`. */
export function generateInviteCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/** True if a string is shaped like one of our codes (used to reject junk early). */
export function isValidCodeFormat(code: string): boolean {
  if (typeof code !== 'string' || code.length !== CODE_LENGTH) return false;
  for (const ch of code) {
    if (!CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

/** Normalises user input (URL param) to the canonical form before lookup. */
export function normaliseCode(raw: string): string {
  return (raw ?? '').trim().toUpperCase();
}

/**
 * The only piece of the inviter we ever expose publicly: their first name.
 * Never the email or last name. Returns null when there's nothing safe to
 * show, so the caller falls back to "Un amico".
 */
export function firstNameForDisplay(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return first.length > 0 ? first : null;
}

/**
 * Builds the public invite URL from the base URL (no trailing slash).
 *
 * Senza `BASE_URL` si ripiegava su localhost: in produzione significava
 * spedire a un amico un link che si apre solo sul computer di chi lo ha
 * generato. Ora il ripiego conosce il dominio vero (vedi `lib/core/site`).
 */
export function buildInviteUrl(
  code: string,
  baseUrl: string = process.env.BASE_URL?.trim() || fallbackAppOrigin()
): string {
  return `${baseUrl.replace(/\/+$/, '')}/invita/${code}`;
}
