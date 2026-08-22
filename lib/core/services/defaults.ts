/**
 * Servizio iniziale creato insieme a ogni nuovo profilo coach.
 *
 * Il prezzo è espresso in centesimi, come nel resto del dominio servizi.
 * Il coach può modificarlo o sostituirlo prima di inviare il profilo alla
 * revisione dell'amministratore.
 */
export const DEFAULT_COACH_SERVICE = {
  title: 'Sessione online',
  description: 'Sport Mental Coach',
  durationMin: 40,
  price: 0,
  currency: 'EUR',
  isActive: true,
} as const;

export function defaultCoachServiceValues(
  providerId: number,
  userId: number
) {
  return {
    providerId,
    ...DEFAULT_COACH_SERVICE,
    createdBy: userId,
  };
}
