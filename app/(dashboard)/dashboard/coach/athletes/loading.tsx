function RowSkeleton() {
  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-4">
        <div className="size-12 shrink-0 animate-pulse rounded-full bg-gray-200" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="h-4 w-1/3 animate-pulse rounded bg-gray-200" />
          <div className="h-3.5 w-1/2 animate-pulse rounded bg-gray-100" />
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-gray-100" />
        </div>
      </div>
    </li>
  );
}

/**
 * Lo scheletro di «I miei Atleti» e della scheda di un atleta: la lettura dei
 * dati richiede un attimo, e senza questo il clic sembrava non fare niente
 * finché la pagina nuova non era pronta. Il titolo c'è già, perché non cambia.
 */
export default function CoachAthletesLoading() {
  return (
    <section className="p-6" aria-busy="true">
      <h1 className="text-2xl font-semibold text-gray-900">I miei Atleti</h1>
      <div className="mt-2 h-4 w-full max-w-xl animate-pulse rounded bg-gray-100" />
      <ul className="mt-6 flex flex-col gap-3" aria-label="Caricamento degli atleti">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </ul>
    </section>
  );
}
