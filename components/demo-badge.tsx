/**
 * Il contrassegno «Demo» accanto a un nome.
 *
 * Serve a una cosa sola: **non scambiare un conto finto per una persona
 * vera**. In amministrazione le due categorie stanno nello stesso elenco, e
 * senza un segno visibile un account di dimostrazione si legge come un utente
 * — e allora si contano iscrizioni che non esistono, o si scrive a qualcuno che
 * non c'è.
 *
 * Grigio e non colorato: è un'etichetta di stato, non un allarme, e non deve
 * competere con lo stato del profilo che gli sta accanto.
 */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      title="Account di dimostrazione, non una persona reale"
      className={`shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 ${className ?? ''}`}
    >
      Demo
    </span>
  );
}
