/**
 * Come si scrive l'esperienza di un coach nelle schede e nel profilo pubblico.
 *
 * «0 anni di esperienza» è brutto e dice il falso per chi ha cominciato da
 * poco: sotto l'anno si contano i mesi. Se «Coach dal» non c'è si ripiega sugli
 * anni dichiarati, e con 0 anni si dice «meno di un anno».
 *
 * Modulo puro, senza `server-only`: lo leggono schede, pannello, profilo e test.
 */

/** I mesi interi dal giorno indicato a `now`; `null` se la data manca, non si legge o è nel futuro. */
export function monthsSince(coachSince: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!coachSince) return null;
  const start = coachSince instanceof Date ? coachSince : new Date(`${coachSince}T00:00:00`);
  if (Number.isNaN(start.getTime()) || start.getTime() > now.getTime()) return null;
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  return Math.max(months, 0);
}

/** «5 mesi di esperienza», «1 anno di esperienza», «3 anni di esperienza»; `null` se non c'è nulla da dire. */
export function experienceLabel(
  input: { yearsExperience: number | null; coachSince?: string | Date | null },
  now: Date = new Date()
): string | null {
  const months = monthsSince(input.coachSince, now);
  if (months != null) {
    if (months >= 12) {
      const years = Math.floor(months / 12);
      return `${years} ${years === 1 ? 'anno' : 'anni'} di esperienza`;
    }
    if (months >= 1) return `${months} ${months === 1 ? 'mese' : 'mesi'} di esperienza`;
    return 'Coach da meno di un mese';
  }
  const years = input.yearsExperience;
  if (years == null) return null;
  if (years < 1) return 'Meno di un anno di esperienza';
  return `${years} ${years === 1 ? 'anno' : 'anni'} di esperienza`;
}
