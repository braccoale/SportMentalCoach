'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

type Item = { id: number; node: React.ReactNode };

/**
 * Trascinamento nativo (nessuna libreria): ogni riga è già renderizzata dal
 * server e passata come nodo pronto — questo componente aggiunge solo la
 * maniglia e l'ordine. L'ordine locale si aggiorna subito al rilascio
 * (l'utente vede il risultato senza aspettare il server); il salvataggio
 * vero passa per `onReorder`, tipicamente una server action chiamata
 * direttamente, non un `<form>`.
 */
export function ReorderableModules({
  items,
  onReorder,
}: {
  items: Item[];
  onReorder: (orderedIds: number[]) => Promise<void>;
}) {
  const router = useRouter();
  const [order, setOrder] = useState(() => items.map((item) => item.id));
  const [dragId, setDragId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const byId = new Map(items.map((item) => [item.id, item.node]));

  function handleDrop(targetId: number) {
    if (dragId === null || dragId === targetId) {
      setDragId(null);
      return;
    }
    const current = order;
    const next = [...current];
    const fromIndex = next.indexOf(dragId);
    const toIndex = next.indexOf(targetId);
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, dragId);
    setOrder(next);
    setDragId(null);
    startTransition(async () => {
      await onReorder(next);
      // I numeri dei moduli (01, 02, …) sono renderizzati dal server in
      // base all'ordine reale: senza un refresh resterebbero quelli vecchi
      // finché la pagina non viene ricaricata da sola.
      router.refresh();
    });
  }

  return (
    <ol className={cn('space-y-2', isPending && 'opacity-70')}>
      {order.map((id) => (
        <li
          key={id}
          draggable
          onDragStart={() => setDragId(id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => handleDrop(id)}
          className={cn(
            'flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 transition-shadow',
            dragId === id && 'opacity-50 shadow-lg'
          )}
        >
          <span
            className="mt-1 flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-gray-300 hover:text-gray-500 active:cursor-grabbing"
            aria-label="Trascina per riordinare"
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">{byId.get(id)}</div>
        </li>
      ))}
    </ol>
  );
}
