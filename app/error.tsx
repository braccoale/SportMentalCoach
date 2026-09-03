'use client';

import { ClientFailureScreen } from '@/components/client-failure-screen';

/**
 * La rete di sicurezza normale: un errore dentro l'app, con il guscio già in
 * piedi.
 *
 * Copre tutto quello che sta sotto la radice — area riservata, marketplace,
 * accesso — e si aggiunge a `global-error`, che interviene solo quando a
 * rompersi è il layout radice stesso. Due file perché sono due momenti
 * diversi: qui il documento c'è, lì non c'è ancora.
 *
 * Usa la stessa schermata, quindi la stessa diagnosi e le stesse parole: un
 * prodotto che spiega lo stesso guasto in due modi diversi a seconda di dove
 * capita insegna a non fidarsi di nessuna delle due spiegazioni.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ClientFailureScreen error={error} onRetry={reset} />;
}
