/**
 * Il lato browser di «utilizzo, tempi ed errori»: spedisce al server ciò che ha
 * misurato. Nessun utente, nessun cookie: il server riconosce la persona solo
 * per decidere di ignorarla (indirizzi esclusi) e non la conserva.
 *
 * Non fa niente fuori dalla produzione: in sviluppo le misure non sono
 * rappresentative e finirebbero nei dati veri (il database di sviluppo è la
 * produzione).
 *
 * Mai un errore verso chi usa il sito: una misura che non parte non si dice a
 * nessuno.
 */
import type { UiErrorKind } from './catalog';

const ENDPOINT = '/api/usage/collect';

type Beacon = Record<string, unknown>;

function enabled(): boolean {
  return typeof window !== 'undefined' && process.env.NODE_ENV === 'production';
}

export function sendUsageBeacon(payload: Beacon): void {
  if (!enabled()) return;
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // `text/plain` evita la richiesta preliminare di controllo: il server legge il corpo come testo.
      if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
    }
    void fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(
      () => {}
    );
  } catch {
    // Una statistica che non parte non si dice a nessuno.
  }
}

/** La connessione dichiarata dal browser (non c'è su tutti). */
export function connectionType(): string | undefined {
  try {
    return (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
  } catch {
    return undefined;
  }
}

/** Segnala un errore che l'utente ha visto. Il codice è il nome dell'errore o la chiave di un messaggio, mai il testo. */
export function reportUiError(kind: UiErrorKind, code?: string, digest?: string): void {
  if (!enabled()) return;
  sendUsageBeacon({ r: window.location.pathname, e: { k: kind, c: code, d: digest }, c: connectionType() });
}

/**
 * Misura quanto ci mette una finestra a essere pronta: `const done = startReadyTimer('booking_dialog')`
 * all'apertura, `done()` quando il contenuto utile è sul schermo. Si registra come `ready:booking_dialog`.
 */
export function startReadyTimer(name: string): () => void {
  if (!enabled()) return () => {};
  const start = performance.now();
  let sent = false;
  return () => {
    if (sent) return;
    sent = true;
    sendUsageBeacon({
      r: window.location.pathname,
      m: [{ n: `ready:${name}`, v: Math.round(performance.now() - start) }],
      c: connectionType(),
    });
  };
}
