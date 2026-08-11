import { Video } from 'lucide-react';

/**
 * La spia «in sessione adesso».
 *
 * Pulsa perché è l'unico stato di questa pagina che cambia da solo mentre la
 * si guarda: tutto il resto — approvato, in attesa, in bozza — è fermo finché
 * qualcuno non agisce. Il movimento distingue il vivo dallo statico, e per
 * questo è l'unica cosa che si muove qui dentro.
 *
 * Il testo accanto non è ridondante: un pallino verde che lampeggia si presta
 * a molte letture, «In sessione» a una sola. E per chi usa uno screen reader
 * il colore non esiste.
 */
export function LiveSessionDot({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ${className}`}
      title="Il coach è in videochiamata in questo momento"
    >
      <span className="relative flex size-2">
        {/* L'alone che si espande e svanisce: è il battito. Chi ha chiesto
            meno animazioni vede un pallino fermo, che dice la stessa cosa. */}
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
      </span>
      <Video className="size-3.5" aria-hidden="true" />
      In sessione
    </span>
  );
}
