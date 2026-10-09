'use client';

import { Info } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { MIN_REVIEWS_FOR_RATING, type RateFactor, type RateLevel } from '@/lib/core/rate-suggestion';

const euro = (n: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

/**
 * L'icona (i) accanto a «Tariffa suggerita»: apre la spiegazione di come si
 * arriva al numero. Fasce, soglie e pesi arrivano dai dati veri (la
 * configurazione di sistema e le voci del calcolo), non da un testo scritto a
 * mano: se l'admin cambia una fascia, la spiegazione cambia con lei.
 */
export function RateExplanationDialog({
  levels,
  factors,
  currentLevelKey,
  size = 'md',
}: {
  levels: RateLevel[];
  factors: RateFactor[];
  currentLevelKey: string;
  size?: 'sm' | 'md';
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Come viene calcolata la tariffa suggerita"
          title="Come viene calcolata"
          className="inline-flex shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
        >
          <Info className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[88dvh] max-w-xl">
        <DialogTitle className="pr-10 text-xl">Come calcoliamo la tariffa suggerita</DialogTitle>
        <DialogDescription>
          Un aiuto per scegliere il prezzo, non un obbligo: la tariffa la decidi sempre tu.
        </DialogDescription>

        <div className="mt-4 space-y-5 text-sm leading-6 text-gray-700">
          <section>
            <h3 className="font-semibold text-gray-950">1. Un punteggio da 0 a 100</h3>
            <p className="mt-1">
              Guardiamo sei fatti sul tuo lavoro. Ognuno vale un massimo di punti; il punteggio è la percentuale dei
              punti che hai ottenuto sul totale disponibile.
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {factors.map((f) => (
                <li key={f.key} className="flex items-baseline justify-between gap-3 border-b border-gray-100 pb-1.5">
                  <span>{f.label}</span>
                  <span className="shrink-0 tabular-nums text-gray-500">fino a {f.max} punti</span>
                </li>
              ))}
            </ul>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-gray-600">
              <li>Anni di esperienza: il massimo a 10 anni (da «Coach dal»).</li>
              <li>Ore di coaching: il massimo a 100 ore erogate sulla piattaforma.</li>
              <li>Titoli: per intero se li ha verificati il team KaiPai, per metà se li hai solo elencati.</li>
              <li>
                Valutazione: conta dopo {MIN_REVIEWS_FOR_RATING} recensioni, perché una sola, anche da cinque stelle,
                non dice abbastanza. Finché non conta, non entra nel totale: un coach nuovo non è penalizzato.
              </li>
              <li>Atleti seguiti: il massimo a 15 atleti.</li>
              <li>Livello degli atleti: di più se lavori con professionisti, un po’ meno con semi-professionisti, amatori e giovani.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-950">2. Dal punteggio al livello</h3>
            <p className="mt-1">Il punteggio ti porta in uno dei quattro livelli, ognuno con la sua fascia oraria.</p>
            <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Livello</th>
                    <th className="px-3 py-2 font-medium">Punteggio</th>
                    <th className="px-3 py-2 font-medium">Fascia / ora</th>
                    <th className="px-3 py-2 font-medium">Suggerito</th>
                  </tr>
                </thead>
                <tbody>
                  {levels.map((l, i) => (
                    <tr key={l.key} className={l.key === currentLevelKey ? 'bg-emerald-50 font-medium text-gray-950' : ''}>
                      <td className="px-3 py-2">
                        {l.label}
                        {l.key === currentLevelKey ? ' · il tuo' : ''}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {i < levels.length - 1 ? `${l.minScore}–${levels[i + 1].minScore - 1}` : `da ${l.minScore}`}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {euro(l.min)} – {euro(l.max)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{euro(l.suggested)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="font-semibold text-gray-950">3. Il prezzo per la tua seduta</h3>
            <p className="mt-1">
              Il suggerito è per 60 minuti. Per un servizio di un’altra durata lo proporzioniamo (45 minuti = tre quarti)
              e arrotondiamo ai 5 euro. Il pulsante «Usa questo prezzo» lo scrive nel campo, ma non cambia mai niente da
              solo.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-950">Cosa non usiamo, e cosa non è</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-gray-600">
              <li>Non usiamo genere, età, foto o città, e nemmeno i prezzi degli altri coach.</li>
              <li>
                Le fasce partono da riferimenti pubblici sul coaching sportivo e sulle sedute online in Italia, e le
                aggiusteremo con i dati della piattaforma. Sono un riferimento KaiPai, non un prezzo di mercato.
              </li>
              <li>Se il tuo prezzo è fuori fascia non è un errore: puoi avere un buon motivo, per esempio una specializzazione rara.</li>
              <li>Il punteggio cresce da solo man mano che fai sedute, ricevi recensioni e completi il profilo.</li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
