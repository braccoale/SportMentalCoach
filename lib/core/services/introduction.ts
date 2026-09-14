/** Fixed terms of the introductory session, shared by the form and server. */
export const INTRO_SESSION = {
  title: 'Sessione conoscitiva (gratis)',
  description: 'Un primo incontro gratuito per conoscersi e parlare dei tuoi obiettivi.',
  durationMin: 20,
  price: 0,
  currency: 'EUR',
} as const;

export function isIntroDurationValid(isIntro: boolean | null, durationMin: number) {
  return !isIntro || durationMin === INTRO_SESSION.durationMin;
}
