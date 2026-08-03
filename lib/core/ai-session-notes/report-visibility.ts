/**
 * Decide se mostrare il pannello del report AI di sessione.
 *
 * Vive qui, e non accanto al pannello, perché il pannello è un componente
 * client (`'use client'`): una funzione esportata da quel modulo non può
 * essere invocata da un server component: Next.js compila senza errori e poi
 * lancia a ogni richiesta. Questo modulo è neutro e importabile da entrambi i
 * lati.
 */
export function canShowAiSessionReport(params: {
  viewerRole: 'coach' | 'athlete';
  aiNotesEnabled: boolean;
  hasAiNotesSession: boolean;
}): boolean {
  return (
    params.viewerRole === 'coach' &&
    params.aiNotesEnabled &&
    params.hasAiNotesSession
  );
}
