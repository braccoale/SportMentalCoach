/**
 * L'atleta non si presenta alla seduta.
 *
 * Regola scelta dal proprietario del prodotto (2026-10-07): il coach entra, chiude
 * la chiamata e completa la seduta segnalando che l'atleta non c'era. La seduta
 * si chiude come fatta — quindi consuma la seduta del piano o quella acquistata,
 * come una disdetta tardiva — e nella chat della prenotazione resta una nota
 * che spiega perché, visibile a entrambi. Non esiste uno stato a parte: è una
 * seduta `completed` con questa nota.
 */
export const NO_SHOW_MESSAGE = 'Sessione chiusa: l’atleta non si è presentato.';
