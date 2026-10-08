/**
 * Lo scheletro di tutte le pagine dell'area coach che non ne hanno uno proprio
 * (la home, il calendario, i messaggi…): le letture richiedono un attimo, e
 * senza questo il clic su una scheda sembrava non fare niente finché la pagina
 * nuova non era pronta. È volutamente neutro (un titolo e qualche riquadro):
 * deve andar bene per ogni pagina, non somigliare a una sola.
 */
export default function CoachAreaLoading() {
  return (
    <section className="flex flex-col gap-6 p-6" aria-busy="true">
      <div className="h-7 w-48 animate-pulse rounded bg-gray-200" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
        ))}
      </div>
      <div className="flex flex-col gap-3" aria-label="Caricamento">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-gray-200 bg-white" />
        ))}
      </div>
    </section>
  );
}
