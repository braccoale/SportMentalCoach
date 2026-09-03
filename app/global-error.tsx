'use client';

import { ClientFailureScreen } from '@/components/client-failure-screen';

/**
 * L'ultima rete: un errore che sfugge anche al layout radice.
 *
 * Senza questo file Next mostra il proprio fallback — «Application error: a
 * client-side exception has occurred while loading <dominio> (see the browser
 * console for more information)» — che è la schermata dello screenshot: in
 * inglese dentro un prodotto italiano, con dentro il nome del deployment, e
 * con un invito ad aprire la console del browser rivolto a persone che non la
 * apriranno mai. Sembra il sistema che si rompe, e chi lo legge conclude che
 * il difetto sia nostro anche quando è la sua rete.
 *
 * `global-error` **rimpiazza il layout radice**, quindi `<html>` e `<body>`
 * vanno dichiarati qui, e il CSS globale importato nel layout non arriva:
 * `ClientFailureScreen` si veste da sola con stili in linea, che è anche la
 * scelta giusta quando il motivo dell'errore è che qualcosa non è arrivato
 * dalla rete.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="it" translate="no">
      <body style={{ margin: 0 }}>
        <ClientFailureScreen error={error} onRetry={reset} />
      </body>
    </html>
  );
}
