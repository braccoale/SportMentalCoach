function CoachCardSkeleton() {
  return (
    <div className="flex overflow-hidden rounded-3xl border border-gray-200/80 bg-white shadow-md ring-1 ring-black/[0.03]">
      <div className="hidden w-[26%] shrink-0 animate-pulse bg-gray-100 sm:block" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="h-5 w-2/3 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
        <div className="mt-1 h-14 animate-pulse rounded-xl bg-gray-50" />
        <div className="mt-auto flex justify-end gap-2">
          <div className="h-9 w-36 animate-pulse rounded-full bg-gray-100" />
          <div className="h-9 w-32 animate-pulse rounded-full bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

export default function CoachesPageLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="max-w-3xl">
        <div className="h-9 w-3/4 animate-pulse rounded bg-gray-200 sm:h-10" />
        <div className="mt-3 h-5 w-full max-w-xl animate-pulse rounded bg-gray-100" />
      </header>

      {/* Stessa cornice del pannello "Filtri avanzati", per non far saltare
          il layout mentre i risultati vengono ricalcolati. */}
      <div className="mt-6 h-16 animate-pulse rounded-2xl border border-gray-200 bg-white" />

      <section className="mt-8">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"
            aria-hidden
          />
          Sto cercando i coach migliori per te…
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CoachCardSkeleton key={i} />
          ))}
        </div>
      </section>
    </main>
  );
}
