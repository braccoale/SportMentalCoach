'use client';

import { useEffect, useState } from 'react';
import {
  classifyClientFailure,
  type ClientFailure,
} from '@/lib/core/errors/client-failure';

/**
 * La schermata che sostituisce «Application error: a client-side exception…».
 *
 * **Stili in linea, non Tailwind.** Non è pigrizia: questa schermata compare
 * proprio quando qualcosa non è arrivato dalla rete, e il foglio di stile è
 * una delle cose che può non essere arrivata. Una pagina d'errore che si
 * presenta senza stile è peggio dell'errore che sta raccontando. Inoltre
 * `global-error` rimpiazza il layout radice, quindi il CSS globale importato
 * lì non la raggiunge comunque.
 *
 * `navigator.onLine` si legge **dopo il montaggio**: sul server non esiste, e
 * leggerlo durante il render darebbe due HTML diversi fra server e browser.
 * Alla prima passata la diagnosi è quella senza il segnale di rete, e si
 * affina subito dopo — che è l'ordine giusto, perché una schermata d'errore
 * deve comparire prima di essere precisa.
 */
export function ClientFailureScreen({
  error,
  onRetry,
}: {
  error: Error & { digest?: string };
  /** `reset()` di Next: rimonta l'albero senza ricaricare la pagina. */
  onRetry: () => void;
}) {
  const [online, setOnline] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const leggi = () => setOnline(navigator.onLine);
    leggi();
    window.addEventListener('online', leggi);
    window.addEventListener('offline', leggi);
    return () => {
      window.removeEventListener('online', leggi);
      window.removeEventListener('offline', leggi);
    };
  }, []);

  const failure: ClientFailure = classifyClientFailure({
    name: error.name,
    message: error.message,
    digest: error.digest,
    online,
  });

  /*
   * Il gesto giusto per il caso giusto.
   *
   * `reset()` rimonta l'albero con il codice che il browser ha gia': su un
   * pezzo che non e' mai arrivato non serve a niente, e un pulsante premuto
   * due volte senza effetto insegna che l'applicazione e' rotta. Quando
   * ricaricare risolve davvero, si ricarica.
   */
  const agisci = () => {
    if (failure.reloadFixes) {
      window.location.reload();
      return;
    }
    onRetry();
  };

  return (
    <div style={S.pagina}>
      <div style={S.riquadro}>
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image
            richiede l'ottimizzatore, che qui potrebbe essere irraggiungibile
            quanto il resto: questa schermata deve reggersi da sola. */}
        <img src="/logo.jpg" alt="KaiPai" width={56} height={56} style={S.logo} />

        <h1 style={S.titolo}>{failure.title}</h1>
        <p style={S.testo}>{failure.body}</p>

        <div style={S.azioni}>
          <button type="button" onClick={agisci} style={S.primario}>
            {failure.actionLabel}
          </button>
          <a href="/dashboard" style={S.secondario}>
            Torna alla home
          </a>
        </div>

        {failure.digest ? (
          <p style={S.codice}>
            Codice per l’assistenza: <code style={S.mono}>{failure.digest}</code>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Il minimo che regge da solo.
 *
 * Colori presi dai token del prodotto — il rosso è `--color-kp-red`, #e11d2a —
 * scritti qui in chiaro perché un `var()` senza foglio di stile non risolve
 * niente. È l'unico posto del progetto dove un colore letterale è la scelta
 * giusta invece del difetto solito.
 */
const S: Record<string, React.CSSProperties> = {
  pagina: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    backgroundColor: '#f9fafb',
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    color: '#111827',
  },
  riquadro: {
    maxWidth: '30rem',
    width: '100%',
    textAlign: 'center',
  },
  logo: {
    height: '56px',
    width: 'auto',
    borderRadius: '12px',
    margin: '0 auto 24px',
    display: 'block',
  },
  titolo: {
    fontSize: '1.5rem',
    lineHeight: 1.25,
    fontWeight: 700,
    margin: '0 0 12px',
    letterSpacing: '-0.01em',
  },
  testo: {
    fontSize: '0.9375rem',
    lineHeight: 1.6,
    color: '#4b5563',
    margin: '0 0 24px',
  },
  azioni: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    justifyContent: 'center',
  },
  primario: {
    appearance: 'none',
    border: 'none',
    borderRadius: '9999px',
    backgroundColor: '#e11d2a',
    color: '#ffffff',
    fontSize: '0.9375rem',
    fontWeight: 600,
    padding: '12px 24px',
    cursor: 'pointer',
    // Bersaglio comodo su un telefono, che è dove questa schermata compare.
    minHeight: '44px',
  },
  secondario: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '9999px',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#374151',
    fontSize: '0.9375rem',
    fontWeight: 500,
    padding: '12px 24px',
    textDecoration: 'none',
    minHeight: '44px',
  },
  codice: {
    marginTop: '20px',
    fontSize: '0.75rem',
    color: '#9ca3af',
  },
  mono: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    color: '#6b7280',
  },
};
