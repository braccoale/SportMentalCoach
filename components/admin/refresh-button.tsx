'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

/**
 * Ricarica i dati della pagina senza ricaricare la pagina: `router.refresh()`
 * rifà il rendering sul server (la pagina è `force-dynamic`) e mantiene
 * scorrimento e stato. L'icona gira finché i dati nuovi non sono arrivati.
 */
export function RefreshButton({ label = 'Aggiorna' }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
    >
      <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} aria-hidden="true" />
      {pending ? 'Aggiorno…' : label}
    </button>
  );
}
