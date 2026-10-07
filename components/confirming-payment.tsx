'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const INTERVAL_MS = 3000;
const MAX_TRIES = 20;

/**
 * «Stiamo confermando il pagamento…». Chi torna da Stripe può arrivare qualche
 * secondo prima che il webhook abbia attivato l'abbonamento: invece di
 * chiedere di ricaricare, la pagina si rilegge da sola, a intervalli, per circa
 * un minuto. Se non basta lo dice, e non insiste all'infinito.
 */
export function ConfirmingPayment() {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const gaveUp = tries >= MAX_TRIES;

  useEffect(() => {
    if (gaveUp) return;
    const timer = setTimeout(() => {
      setTries((count) => count + 1);
      router.refresh();
    }, INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [tries, gaveUp, router]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-gray-700"
    >
      {gaveUp ? (
        <>
          <p className="font-semibold text-gray-900">
            La conferma sta impiegando più del solito.
          </p>
          <p className="mt-1">
            Il pagamento è partito: ricarica la pagina tra qualche minuto. Se
            l&apos;abbonamento non compare, scrivici dal Supporto.
          </p>
        </>
      ) : (
        <>
          <p className="font-semibold text-gray-900">
            Pagamento ricevuto: stiamo confermando il tuo abbonamento…
          </p>
          <p className="mt-1">Ci vuole qualche secondo, la pagina si aggiorna da sola.</p>
        </>
      )}
    </div>
  );
}
