'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { BookableDay } from '@/lib/core/availability';

type State =
  | { status: 'loading' }
  | { status: 'ready'; days: BookableDay[]; notice: string | null }
  | { status: 'error' };

/**
 * Chiede al server i giorni e gli orari prenotabili di un coach nel momento in
 * cui la finestra di prenotazione si apre, e li passa al modulo.
 *
 * Sta dentro il contenuto della finestra, che Radix monta solo da aperta: nessuna
 * richiesta finché nessuno clicca, e una nuova ogni volta che si riapre (gli
 * orari sono sempre quelli di adesso, mai di una pagina caricata ore prima).
 * Mentre aspetta mostra un segnaposto; se la richiesta fallisce lo dice e
 * offre di riprovare, invece di un calendario vuoto che direbbe «il coach non è
 * libero».
 */
export function LazyBookingCalendar({
  slug,
  kind,
  children,
}: {
  slug: string;
  kind: 'intro' | 'book';
  children: (calendar: { days: BookableDay[]; notice: string | null }) => React.ReactNode;
}) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetch(`/api/coaches/${encodeURIComponent(slug)}/calendar?kind=${kind}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as {
          days?: BookableDay[];
          notice?: string | null;
        };
        setState({ status: 'ready', days: body.days ?? [], notice: body.notice ?? null });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [slug, kind, attempt]);

  if (state.status === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-64 items-center justify-center gap-2 rounded-2xl bg-gray-50 text-sm text-gray-500"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Carico i giorni disponibili…
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div
        role="alert"
        className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl bg-amber-50 px-4 text-center text-sm text-amber-900"
      >
        Non siamo riusciti a caricare le date disponibili.
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="rounded-full border border-amber-300 bg-white px-4 py-1.5 font-semibold hover:bg-amber-100"
        >
          Riprova
        </button>
      </div>
    );
  }
  return <>{children({ days: state.days, notice: state.notice })}</>;
}
